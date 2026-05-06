/**
 * 多笔报销合并支付落账（A1 完整版，2026-05-07）
 *
 * POST /api/finance/approvals/from-tg-batch-payment
 *
 * 用途：出纳/老板把 N 条已批审批合并成一笔链上转账时，bridge 调本端点。
 * 例：批 3 条审批（小张 50 USDC、小李 80 USDC、小王 70 USDC），出纳合并转 200 USDC 给同一员工或 OTC 商家。
 *
 * 入参：
 *  - approvalInstanceIds: string[] — N 条 WAITING_PAYMENT 审批的 instance.id
 *  - txHash: string — 同一笔合并转账的 hash
 *  - senderAddress: string — 出纳钱包（必须是出纳，bridge 上层校验）
 *
 * 验证：
 *  - 所有 instance 必须 status=APPROVED && aiPaymentStatus=WAITING_PAYMENT && template=finance-large-payment
 *  - 所有 instance 的 form.currency 必须一致（要么全 USDC 要么全 USDT）
 *  - 链上 transfer total amount 严格 = sum(form.amount)
 *
 * 落账：
 *  - 创建 N 个 voucher（每个 = 1 条 instance），voucher.amount = 该 instance.form.amount
 *  - 所有 voucher.notes 引用同一个 hash + sender + 总额（便于审计回溯）
 *  - 所有 instance.aiPaymentStatus = POSTED
 *  - paymentProofs 数组里 N 条 hash 引用（type=hash_batch_member），voucherId 各自不同
 *
 * 鉴权：X-Bridge-Key
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const ETHERSCAN_BASE = 'https://api.etherscan.io/v2/api';
const ETH_CHAIN_ID = '1';

const KNOWN_TOKEN_CONTRACTS: Record<string, string> = {
  USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  USDT: '0xdac17f958d2ee523a2206206994597c13d831ec7',
};

const schema = z.object({
  // 接受完整 cuid 或前缀（≥6 字符，cuid 以 'c' 开头，prefix 友好让老板抄前 8 位即可）
  approvalInstanceIds: z.array(z.string().min(6)).min(2).max(20),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'txHash must be 0x + 64 hex chars'),
  senderAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'senderAddress must be 0x + 40 hex chars'),
  notes: z.string().max(1000).optional().nullable(),
  fromTgUserId: z.number().int().positive().optional(),
});

export async function POST(req: NextRequest) {
  const got = req.headers.get('x-bridge-key') ?? '';
  const expected = process.env.FINANCE_BRIDGE_KEY ?? '';
  if (!expected) {
    return NextResponse.json({ error: 'BRIDGE_KEY_NOT_CONFIGURED' }, { status: 500 });
  }
  if (got !== expected) {
    return NextResponse.json({ error: 'BAD_BRIDGE_KEY' }, { status: 401 });
  }

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

  // 1) 把每个 idOrPrefix 解析为完整 instance.id（支持前缀，老板从 TG/看板抄前 8 位即可）
  const resolvedIds: string[] = [];
  const ambiguousPrefixes: { prefix: string; matches: string[] }[] = [];
  const missingPrefixes: string[] = [];
  for (const idOrPrefix of data.approvalInstanceIds) {
    if (idOrPrefix.length >= 24) {
      // 完整 cuid 直接用
      resolvedIds.push(idOrPrefix);
      continue;
    }
    const candidates = await prisma.approvalInstance.findMany({
      where: {
        id: { startsWith: idOrPrefix },
        aiPaymentStatus: 'WAITING_PAYMENT',
        status: 'APPROVED',
      },
      select: { id: true },
      take: 5,
    });
    if (candidates.length === 0) {
      missingPrefixes.push(idOrPrefix);
    } else if (candidates.length > 1) {
      ambiguousPrefixes.push({
        prefix: idOrPrefix,
        matches: candidates.map((c) => c.id),
      });
    } else {
      resolvedIds.push(candidates[0].id);
    }
  }
  if (missingPrefixes.length > 0) {
    return NextResponse.json(
      {
        error: 'PREFIX_NO_MATCH',
        message: '以下前缀找不到对应 WAITING_PAYMENT 审批',
        missingPrefixes,
      },
      { status: 404 },
    );
  }
  if (ambiguousPrefixes.length > 0) {
    return NextResponse.json(
      {
        error: 'PREFIX_AMBIGUOUS',
        message: '以下前缀匹配多个审批，请用更长的前缀（建议 8 位以上）',
        ambiguousPrefixes,
      },
      { status: 409 },
    );
  }

  // 2) 拉所有 instance 并校验状态 + 模板
  const instances = await prisma.approvalInstance.findMany({
    where: { id: { in: resolvedIds } },
    include: { template: { select: { slug: true } } },
  });

  if (instances.length !== resolvedIds.length) {
    const found = new Set(instances.map((i) => i.id));
    const missing = resolvedIds.filter((id) => !found.has(id));
    return NextResponse.json({ error: 'INSTANCE_NOT_FOUND', missing }, { status: 404 });
  }

  for (const inst of instances) {
    if (inst.template.slug !== 'finance-large-payment') {
      return NextResponse.json(
        { error: 'NOT_FINANCE_TEMPLATE', instanceId: inst.id, got: inst.template.slug },
        { status: 400 },
      );
    }
    if (inst.status !== 'APPROVED') {
      return NextResponse.json(
        { error: 'INSTANCE_NOT_APPROVED', instanceId: inst.id, currentStatus: inst.status },
        { status: 409 },
      );
    }
    if (inst.aiPaymentStatus !== 'WAITING_PAYMENT') {
      return NextResponse.json(
        {
          error: 'NOT_WAITING_PAYMENT',
          instanceId: inst.id,
          currentAiPaymentStatus: inst.aiPaymentStatus,
        },
        { status: 409 },
      );
    }
  }

  // 2) 解析每个 form 拿 amount + currency；要求 currency 全一致
  type ParsedForm = {
    instanceId: string;
    title: string;
    amount: number;
    currency: string;
    formJson: string;
  };
  const parsedForms: ParsedForm[] = [];
  let unifiedCurrency: string | null = null;
  for (const inst of instances) {
    let form: Record<string, unknown> = {};
    try {
      form = JSON.parse(inst.formJson || '{}');
    } catch {
      return NextResponse.json({ error: 'FORM_JSON_INVALID', instanceId: inst.id }, { status: 500 });
    }
    const amt = Number(form.amount);
    const cur = String(form.currency ?? '').toUpperCase();
    if (!Number.isFinite(amt) || amt <= 0) {
      return NextResponse.json(
        { error: 'FORM_AMOUNT_INVALID', instanceId: inst.id },
        { status: 400 },
      );
    }
    if (!cur) {
      return NextResponse.json(
        { error: 'FORM_CURRENCY_MISSING', instanceId: inst.id },
        { status: 400 },
      );
    }
    if (unifiedCurrency === null) unifiedCurrency = cur;
    else if (unifiedCurrency !== cur) {
      return NextResponse.json(
        {
          error: 'CURRENCY_MIXED_IN_BATCH',
          message: `批量必须同币种，已遇到 ${unifiedCurrency} vs ${cur}`,
          instanceId: inst.id,
        },
        { status: 400 },
      );
    }
    parsedForms.push({ instanceId: inst.id, title: inst.title, amount: amt, currency: cur, formJson: inst.formJson });
  }

  if (!unifiedCurrency || !KNOWN_TOKEN_CONTRACTS[unifiedCurrency]) {
    return NextResponse.json(
      { error: 'CURRENCY_NOT_SUPPORTED_ON_CHAIN', currency: unifiedCurrency },
      { status: 400 },
    );
  }
  const expectedContract = KNOWN_TOKEN_CONTRACTS[unifiedCurrency];
  const totalExpected = parsedForms.reduce((s, p) => s + p.amount, 0);

  // 3) Etherscan 拉 sender 钱包近期 token transfer 找 hash
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ETHERSCAN_KEY_NOT_CONFIGURED' }, { status: 500 });
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
    offset: '50',
    apikey: apiKey,
  });
  const esRes = await fetch(`${ETHERSCAN_BASE}?${esParams.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!esRes.ok) {
    return NextResponse.json({ error: 'ETHERSCAN_FAILED', status: esRes.status }, { status: 502 });
  }
  const esJson = (await esRes.json()) as {
    status?: string;
    message?: string;
    result?: Array<{
      hash: string;
      from: string;
      to: string;
      value: string;
      tokenSymbol: string;
      tokenDecimal: string;
      timeStamp: string;
    }>;
  };
  if (esJson.status === '0' || !Array.isArray(esJson.result)) {
    return NextResponse.json(
      { error: 'ETHERSCAN_BUSINESS_ERROR', message: esJson.message ?? 'unknown' },
      { status: 502 },
    );
  }
  const tx = esJson.result.find((r) => r.hash.toLowerCase() === data.txHash.toLowerCase());
  if (!tx) {
    return NextResponse.json(
      {
        error: 'TX_HASH_NOT_FOUND_FOR_SENDER',
        message: `txHash 在 sender ${data.senderAddress} 近 50 笔 ${unifiedCurrency} transfer 没找到`,
      },
      { status: 404 },
    );
  }

  // 4) 严格校验：链上 amount = 所有 instance form.amount 之和
  const decimals = Number(tx.tokenDecimal);
  const expectedRaw = BigInt(Math.round(totalExpected * 10 ** decimals));
  let actualRaw: bigint;
  try {
    actualRaw = BigInt(tx.value);
  } catch {
    return NextResponse.json({ error: 'TX_VALUE_NOT_INT', txValue: tx.value }, { status: 502 });
  }
  if (actualRaw !== expectedRaw) {
    const actualAmount = Number(actualRaw.toString()) / 10 ** decimals;
    return NextResponse.json(
      {
        error: 'BATCH_AMOUNT_MISMATCH',
        message: `批量 0 差异：N 条审批合计 ${totalExpected} ${unifiedCurrency}，链上 transfer ${actualAmount} ${tx.tokenSymbol}。任何不等都拒收。`,
        expected: { total: totalExpected, currency: unifiedCurrency, components: parsedForms.map((p) => ({ instanceId: p.instanceId, amount: p.amount })) },
        actual: { amount: actualAmount, currency: tx.tokenSymbol, rawValue: tx.value },
      },
      { status: 422 },
    );
  }
  if (tx.tokenSymbol.toUpperCase() !== unifiedCurrency) {
    return NextResponse.json(
      { error: 'TOKEN_SYMBOL_MISMATCH', expected: unifiedCurrency, actual: tx.tokenSymbol },
      { status: 422 },
    );
  }
  if (tx.from.toLowerCase() !== data.senderAddress.toLowerCase()) {
    return NextResponse.json(
      { error: 'TX_SENDER_MISMATCH', expected: data.senderAddress, actual: tx.from },
      { status: 422 },
    );
  }

  // 5) 在一个事务里：N 条 voucher + N 条 instance 更新
  const txTimestampMs = Number(tx.timeStamp) * 1000;
  const txUrl = `https://etherscan.io/tx/${tx.hash}`;
  const batchTag = `BATCH-${tx.hash.slice(2, 10)}-${parsedForms.length}`;

  const created = await prisma.$transaction(async (txDb) => {
    const vouchers: { instanceId: string; voucherId: string; amount: number }[] = [];

    for (const pf of parsedForms) {
      const voucher = await txDb.voucher.create({
        data: {
          date: new Date(),
          summary: `${pf.title} · 合并支付（${batchTag}）`,
          debitAccount: '管理费用-办公费',
          creditAccount: `其他货币资金-${unifiedCurrency}钱包`,
          amount: pf.amount,
          currency: unifiedCurrency!,
          notes: [
            `合并支付一笔 ${tx.tokenSymbol} ${actualRaw.toString()} (decimals ${decimals})`,
            `Batch tag: ${batchTag}（${parsedForms.length} 条审批）`,
            `链上 hash: ${tx.hash}`,
            `出账钱包: ${tx.from}`,
            `收款钱包（合并目的地）: ${tx.to}`,
            `上链时间: ${new Date(txTimestampMs).toISOString()}`,
          ].join('\n'),
          status: 'AI_DRAFT',
          createdByAi: 'bridge_batch_auto',
          approvalInstanceId: pf.instanceId,
        },
      });
      vouchers.push({ instanceId: pf.instanceId, voucherId: voucher.id, amount: pf.amount });

      // 写 paymentProofs
      const inst = instances.find((i) => i.id === pf.instanceId)!;
      let proofs: unknown[] = [];
      if (inst.paymentProofs) {
        try {
          const p = JSON.parse(inst.paymentProofs);
          if (Array.isArray(p)) proofs = p;
        } catch {
          proofs = [];
        }
      }
      proofs.push({
        type: 'hash_batch_member',
        chain: 'ethereum',
        hash: tx.hash,
        txUrl,
        from: tx.from,
        to: tx.to,
        amount: pf.amount,
        batchTotal: totalExpected,
        currency: unifiedCurrency,
        batchTag,
        txAt: new Date(txTimestampMs).toISOString(),
        attachedAt: new Date().toISOString(),
        voucherId: voucher.id,
      });

      await txDb.approvalInstance.update({
        where: { id: pf.instanceId },
        data: {
          aiPaymentStatus: 'POSTED',
          paymentProofs: JSON.stringify(proofs),
        },
      });
    }

    return vouchers;
  });

  return NextResponse.json(
    {
      ok: true,
      batchTag,
      txHash: tx.hash,
      txUrl,
      totalAmount: totalExpected,
      currency: unifiedCurrency,
      vouchers: created,
    },
    { status: 201 },
  );
}
