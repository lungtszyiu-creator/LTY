/**
 * 付款凭证上链验证 + 自动落账（A1，2026-05-06）
 *
 * POST /api/finance/approvals/[id]/attach-payment-proof
 *
 * 用途：链上记账员 AI 收到老板/出纳 reply 审批 ack 消息附带的链上 hash 时调本端点。
 *  端点替 AI 做以下事：
 *    1) Etherscan 拉 sender 地址近期 token transfer，确认 txHash 真实存在
 *    2) 严格校验链上 token transfer 的 amount / token symbol == form.amount / form.currency
 *    3) 通过 → prisma.voucher.create（关联到 approvalInstance.id），状态 AI_DRAFT
 *    4) 更新 ApprovalInstance.paymentProofs（append）+ aiPaymentStatus='POSTED'
 *
 * 信任边界：
 *  - AI 提供凭证科目（debitAccount/creditAccount）—— 由链上记账员的 prompt 决定，
 *    后端不替 AI 判断科目对错（这是 AI 的本职）
 *  - 后端做的是「链上数据真伪 + 金额严格匹配」的把关，不让 AI 编造哈希或绕过金额
 *
 * 严格 0 差异：链上 USDC/USDT 是精确 6 位小数 transfer，老板钱包 UI 输多少转多少，
 *  不存在"凑整"问题。任何金额不等都拒收 → 标 needs_review，老板手动复核。
 *
 * 鉴权：FINANCE_AI:chain_bookkeeper（链上记账员专属 scope）
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuthOrApiKey } from '@/lib/api-auth';
import { logAiActivity } from '@/lib/ai-log';

const ETHERSCAN_BASE = 'https://api.etherscan.io/v2/api';
const ETH_CHAIN_ID = '1';

// 已知主网稳定币合约（小写存）—— 校验用 token symbol 反推 contract，避免 AI 自填假地址
const KNOWN_TOKEN_CONTRACTS: Record<string, string> = {
  USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  USDT: '0xdac17f958d2ee523a2206206994597c13d831ec7',
};

const schema = z.object({
  txHash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, 'txHash must be 0x + 64 hex chars'),
  chain: z.literal('ethereum'), // 阶段 1 只支持 ETH 主网
  // 老板的钱包地址（出账方）—— 用于 etherscan tokenTxList 反查
  senderAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'senderAddress must be 0x + 40 hex chars'),
  // AI 决定的凭证科目（链上记账员 prompt 里有规则）
  voucherDate: z.string().datetime(),
  summary: z.string().min(1).max(500),
  debitAccount: z.string().min(1).max(100),
  creditAccount: z.string().min(1).max(100),
  notes: z.string().max(1000).optional().nullable(),
  vaultPath: z.string().optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuthOrApiKey(req, ['FINANCE_AI:chain_bookkeeper'], 'EDIT');
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'VALIDATION_FAILED',
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // 1) 查 instance + 校验状态
  const inst = await prisma.approvalInstance.findUnique({
    where: { id: params.id },
    include: {
      template: { select: { slug: true, name: true } },
    },
  });
  if (!inst) {
    return NextResponse.json({ error: 'INSTANCE_NOT_FOUND' }, { status: 404 });
  }
  if (inst.template.slug !== 'finance-large-payment') {
    return NextResponse.json(
      { error: 'NOT_FINANCE_TEMPLATE', got: inst.template.slug },
      { status: 400 },
    );
  }
  if (inst.status !== 'APPROVED') {
    return NextResponse.json(
      { error: 'INSTANCE_NOT_APPROVED', currentStatus: inst.status },
      { status: 409 },
    );
  }
  if (inst.aiPaymentStatus !== 'WAITING_PAYMENT') {
    return NextResponse.json(
      {
        error: 'NOT_WAITING_PAYMENT',
        currentAiPaymentStatus: inst.aiPaymentStatus,
        message:
          inst.aiPaymentStatus === 'POSTED'
            ? 'This approval has already been posted; cannot attach again.'
            : 'aiPaymentStatus is null — finance hook never fired. Investigate.',
      },
      { status: 409 },
    );
  }

  // 2) 解析 form 拿到审批批准的金额 + 币种
  let form: Record<string, unknown> = {};
  try {
    form = JSON.parse(inst.formJson || '{}');
  } catch {
    return NextResponse.json({ error: 'FORM_JSON_INVALID' }, { status: 500 });
  }
  const expectedAmountRaw = form.amount;
  const expectedCurrency = String(form.currency ?? '').toUpperCase();
  if (!expectedAmountRaw || !expectedCurrency) {
    return NextResponse.json(
      {
        error: 'FORM_MISSING_AMOUNT_OR_CURRENCY',
        formAmount: form.amount,
        formCurrency: form.currency,
      },
      { status: 400 },
    );
  }
  const expectedAmount = Number(expectedAmountRaw);
  if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
    return NextResponse.json(
      { error: 'FORM_AMOUNT_INVALID', formAmount: form.amount },
      { status: 400 },
    );
  }
  const expectedContract = KNOWN_TOKEN_CONTRACTS[expectedCurrency];
  if (!expectedContract) {
    return NextResponse.json(
      {
        error: 'CURRENCY_NOT_SUPPORTED_ON_CHAIN',
        currency: expectedCurrency,
        message: 'A1 仅支持 USDC/USDT；其他币种走未来银行截图通道',
      },
      { status: 400 },
    );
  }

  // 3) Etherscan 拉 sender 近期 token transfer，找 hash 是否真存在
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ETHERSCAN_KEY_NOT_CONFIGURED' },
      { status: 500 },
    );
  }
  const esParams = new URLSearchParams({
    chainid: ETH_CHAIN_ID,
    module: 'account',
    action: 'tokentx',
    address: data.senderAddress,
    contractaddress: expectedContract,
    startblock: '0',
    endblock: '99999999',
    sort: 'desc',
    page: '1',
    offset: '50', // 近 50 笔够覆盖几天内的转账
    apikey: apiKey,
  });
  const esRes = await fetch(`${ETHERSCAN_BASE}?${esParams.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!esRes.ok) {
    return NextResponse.json(
      { error: 'ETHERSCAN_FAILED', status: esRes.status },
      { status: 502 },
    );
  }
  const esJson = (await esRes.json()) as {
    status?: string;
    message?: string;
    result?: Array<{
      hash: string;
      from: string;
      to: string;
      value: string; // raw amount, not yet decimal-normalised
      tokenSymbol: string;
      tokenDecimal: string;
      timeStamp: string;
    }>;
  };
  if (esJson.status === '0' || !Array.isArray(esJson.result)) {
    return NextResponse.json(
      {
        error: 'ETHERSCAN_BUSINESS_ERROR',
        message: esJson.message ?? 'unknown',
      },
      { status: 502 },
    );
  }

  // 4) 严格匹配 hash
  const targetHash = data.txHash.toLowerCase();
  const tx = esJson.result.find((r) => r.hash.toLowerCase() === targetHash);
  if (!tx) {
    return NextResponse.json(
      {
        error: 'TX_HASH_NOT_FOUND_FOR_SENDER',
        message: `txHash ${data.txHash} 在 sender ${data.senderAddress} 近 50 笔 ${expectedCurrency} transfer 中没找到。可能：哈希错、sender 错、转账太久前、或还没上链。`,
      },
      { status: 404 },
    );
  }

  // 5) 严格匹配金额（链上 USDC/USDT 6 decimals，0 差异）
  const decimals = Number(tx.tokenDecimal);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    return NextResponse.json(
      { error: 'TOKEN_DECIMALS_INVALID', tokenDecimal: tx.tokenDecimal },
      { status: 502 },
    );
  }
  // 用整数比较避免浮点误差：链上 raw value 与 form.amount * 10^decimals 严格相等
  const expectedRaw = BigInt(Math.round(expectedAmount * 10 ** decimals));
  let actualRaw: bigint;
  try {
    actualRaw = BigInt(tx.value);
  } catch {
    return NextResponse.json(
      { error: 'TX_VALUE_NOT_INT', txValue: tx.value },
      { status: 502 },
    );
  }
  if (actualRaw !== expectedRaw) {
    const actualAmountForDisplay = Number(actualRaw.toString()) / 10 ** decimals;
    return NextResponse.json(
      {
        error: 'AMOUNT_MISMATCH',
        message: `严格 0 差异：审批金额 ${expectedAmount} ${expectedCurrency}，链上实际 ${actualAmountForDisplay} ${tx.tokenSymbol}。任何不等都拒收。`,
        expected: { amount: expectedAmount, currency: expectedCurrency },
        actual: {
          amount: actualAmountForDisplay,
          currency: tx.tokenSymbol,
          rawValue: tx.value,
          decimals,
        },
      },
      { status: 422 },
    );
  }
  if (tx.tokenSymbol.toUpperCase() !== expectedCurrency) {
    return NextResponse.json(
      {
        error: 'TOKEN_SYMBOL_MISMATCH',
        expected: expectedCurrency,
        actual: tx.tokenSymbol,
      },
      { status: 422 },
    );
  }
  if (tx.from.toLowerCase() !== data.senderAddress.toLowerCase()) {
    return NextResponse.json(
      {
        error: 'TX_SENDER_MISMATCH',
        expected: data.senderAddress,
        actual: tx.from,
      },
      { status: 422 },
    );
  }

  // 6) 创建 voucher（关联 approvalInstance）+ 更新 instance（一个事务）
  const txTimestampMs = Number(tx.timeStamp) * 1000;
  const txUrl = `https://etherscan.io/tx/${tx.hash}`;

  const created = await prisma.$transaction(async (txDb) => {
    const voucher = await txDb.voucher.create({
      data: {
        date: new Date(data.voucherDate),
        summary: data.summary,
        debitAccount: data.debitAccount,
        creditAccount: data.creditAccount,
        amount: expectedAmount,
        currency: expectedCurrency,
        notes:
          (data.notes ? `${data.notes}\n\n` : '') +
          `链上 hash: ${tx.hash}\n出账钱包: ${tx.from}\n收款钱包: ${tx.to}\n上链时间: ${new Date(
            txTimestampMs,
          ).toISOString()}`,
        vaultPath: data.vaultPath ?? null,
        status: 'AI_DRAFT',
        createdByAi: auth.kind === 'apikey' ? auth.ctx.scope.split(':')[1] || null : null,
        createdById: auth.kind === 'session' ? auth.userId : null,
        approvalInstanceId: inst.id,
      },
    });

    // append paymentProof entry
    let proofs: unknown[] = [];
    if (inst.paymentProofs) {
      try {
        const parsedProofs = JSON.parse(inst.paymentProofs);
        if (Array.isArray(parsedProofs)) proofs = parsedProofs;
      } catch {
        // 旧数据脏了就当作空，重新写
        proofs = [];
      }
    }
    proofs.push({
      type: 'hash',
      chain: 'ethereum',
      hash: tx.hash,
      txUrl,
      from: tx.from,
      to: tx.to,
      amount: expectedAmount,
      currency: expectedCurrency,
      txAt: new Date(txTimestampMs).toISOString(),
      attachedAt: new Date().toISOString(),
      voucherId: voucher.id,
    });

    await txDb.approvalInstance.update({
      where: { id: inst.id },
      data: {
        aiPaymentStatus: 'POSTED',
        paymentProofs: JSON.stringify(proofs),
      },
    });

    return voucher;
  });

  if (auth.kind === 'apikey') {
    await logAiActivity({
      aiRole: auth.ctx.scope.split(':')[1] ?? 'unknown',
      action: 'attach_payment_proof',
      apiKeyId: auth.ctx.apiKeyId,
      voucherId: created.id,
      payload: {
        approvalInstanceId: inst.id,
        txHash: tx.hash,
        amount: expectedAmount,
        currency: expectedCurrency,
      },
      vaultWritten: !!data.vaultPath,
    });
  }

  return NextResponse.json(
    {
      ok: true,
      voucher: created,
      approvalInstanceId: inst.id,
      txHash: tx.hash,
      txUrl,
    },
    { status: 201 },
  );
}
