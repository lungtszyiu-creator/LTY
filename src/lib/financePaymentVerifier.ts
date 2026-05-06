/**
 * 链上付款凭证验证 + 自动落账核心逻辑（A1，2026-05-06）
 *
 * 提取自 /api/finance/approvals/[id]/attach-payment-proof，让两条路径共用：
 *  - attach-payment-proof endpoint（链上记账员 AI 调用，科目可由 AI 提供）
 *  - from-tg-payment endpoint（bridge 调用，无 AI，科目用默认 fallback）
 *
 * 严格 0 差异：链上 USDC/USDT 精确 6 decimals，任何金额不等都拒收。
 *
 * 信任边界：本 lib 只接受**已查好 + 状态校验通过**的 instance（template.slug='finance-large-payment'
 * + status='APPROVED' + aiPaymentStatus='WAITING_PAYMENT'）。状态校验由调用方做。
 */
import { prisma } from './db';
import type { ApprovalInstance } from '@prisma/client';

const ETHERSCAN_BASE = 'https://api.etherscan.io/v2/api';
const ETH_CHAIN_ID = '1';

// 已知主网稳定币合约（小写存）—— 校验用 token symbol 反推 contract，避免 AI/bridge 自填假地址
const KNOWN_TOKEN_CONTRACTS: Record<string, string> = {
  USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  USDT: '0xdac17f958d2ee523a2206206994597c13d831ec7',
};

export type VerifyAndPostParams = {
  txHash: string;
  senderAddress: string;
  voucherDate?: string; // ISO; 不传 = 现在
  summary?: string; // 不传 = "<title> · 报销付款"
  debitAccount?: string; // 不传 = '管理费用-办公费'（A1 默认）
  creditAccount?: string; // 不传 = '其他货币资金-{USDC/USDT}钱包'（按 token 自动）
  notes?: string;
  vaultPath?: string;
  createdByAi?: string; // 'chain_bookkeeper' / 'bridge' / etc
  createdById?: string; // for web users
};

export type VerifyAndPostError = {
  ok: false;
  status: number; // HTTP status code 调用方原样转发
  error: string;
  [key: string]: unknown;
};

export type VerifyAndPostSuccess = {
  ok: true;
  voucher: { id: string; voucherNumber: string | null; status: string; amount: unknown; currency: string };
  approvalInstanceId: string;
  txHash: string;
  txUrl: string;
};

export type VerifyAndPostResult = VerifyAndPostError | VerifyAndPostSuccess;

/**
 * 验证 + 落账。调用方负责：
 *  1) 查好 instance（含 template + 字段 aiPaymentStatus / paymentProofs / formJson）
 *  2) 校验 instance.template.slug === 'finance-large-payment'
 *  3) 校验 instance.status === 'APPROVED' && instance.aiPaymentStatus === 'WAITING_PAYMENT'
 */
export async function verifyAndPostChainPayment(
  inst: ApprovalInstance,
  params: VerifyAndPostParams,
): Promise<VerifyAndPostResult> {
  // 1) 解析 form 拿到审批批准的金额 + 币种
  let form: Record<string, unknown> = {};
  try {
    form = JSON.parse(inst.formJson || '{}');
  } catch {
    return { ok: false, status: 500, error: 'FORM_JSON_INVALID' };
  }
  const expectedAmountRaw = form.amount;
  const expectedCurrency = String(form.currency ?? '').toUpperCase();
  if (!expectedAmountRaw || !expectedCurrency) {
    return {
      ok: false,
      status: 400,
      error: 'FORM_MISSING_AMOUNT_OR_CURRENCY',
      formAmount: form.amount,
      formCurrency: form.currency,
    };
  }
  const expectedAmount = Number(expectedAmountRaw);
  if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
    return { ok: false, status: 400, error: 'FORM_AMOUNT_INVALID', formAmount: form.amount };
  }
  const expectedContract = KNOWN_TOKEN_CONTRACTS[expectedCurrency];
  if (!expectedContract) {
    return {
      ok: false,
      status: 400,
      error: 'CURRENCY_NOT_SUPPORTED_ON_CHAIN',
      currency: expectedCurrency,
      message: 'A1 仅支持 USDC/USDT；其他币种走未来银行截图通道',
    };
  }

  // 2) Etherscan 拉 sender 近期 token transfer
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 500, error: 'ETHERSCAN_KEY_NOT_CONFIGURED' };
  }
  const esParams = new URLSearchParams({
    chainid: ETH_CHAIN_ID,
    module: 'account',
    action: 'tokentx',
    address: params.senderAddress,
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
    return { ok: false, status: 502, error: 'ETHERSCAN_FAILED', upstreamStatus: esRes.status };
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
    return {
      ok: false,
      status: 502,
      error: 'ETHERSCAN_BUSINESS_ERROR',
      message: esJson.message ?? 'unknown',
    };
  }

  // 3) 严格匹配 hash
  const targetHash = params.txHash.toLowerCase();
  const tx = esJson.result.find((r) => r.hash.toLowerCase() === targetHash);
  if (!tx) {
    return {
      ok: false,
      status: 404,
      error: 'TX_HASH_NOT_FOUND_FOR_SENDER',
      message: `txHash ${params.txHash} 在 sender ${params.senderAddress} 近 50 笔 ${expectedCurrency} transfer 中没找到。可能：哈希错、sender 错、转账太久前、或还没上链。`,
    };
  }

  // 4) 严格匹配金额（链上 USDC/USDT 6 decimals，0 差异）
  const decimals = Number(tx.tokenDecimal);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    return { ok: false, status: 502, error: 'TOKEN_DECIMALS_INVALID', tokenDecimal: tx.tokenDecimal };
  }
  const expectedRaw = BigInt(Math.round(expectedAmount * 10 ** decimals));
  let actualRaw: bigint;
  try {
    actualRaw = BigInt(tx.value);
  } catch {
    return { ok: false, status: 502, error: 'TX_VALUE_NOT_INT', txValue: tx.value };
  }
  if (actualRaw !== expectedRaw) {
    const actualAmountForDisplay = Number(actualRaw.toString()) / 10 ** decimals;
    return {
      ok: false,
      status: 422,
      error: 'AMOUNT_MISMATCH',
      message: `严格 0 差异：审批金额 ${expectedAmount} ${expectedCurrency}，链上实际 ${actualAmountForDisplay} ${tx.tokenSymbol}。任何不等都拒收。`,
      expected: { amount: expectedAmount, currency: expectedCurrency },
      actual: {
        amount: actualAmountForDisplay,
        currency: tx.tokenSymbol,
        rawValue: tx.value,
        decimals,
      },
    };
  }
  if (tx.tokenSymbol.toUpperCase() !== expectedCurrency) {
    return {
      ok: false,
      status: 422,
      error: 'TOKEN_SYMBOL_MISMATCH',
      expected: expectedCurrency,
      actual: tx.tokenSymbol,
    };
  }
  if (tx.from.toLowerCase() !== params.senderAddress.toLowerCase()) {
    return {
      ok: false,
      status: 422,
      error: 'TX_SENDER_MISMATCH',
      expected: params.senderAddress,
      actual: tx.from,
    };
  }

  // 5) 落账（一个事务）
  const txTimestampMs = Number(tx.timeStamp) * 1000;
  const txUrl = `https://etherscan.io/tx/${tx.hash}`;

  // A1 默认科目（无 AI 时 bridge 直接调用走这）：
  //   借：管理费用-办公费（最常见的报销场景）
  //   贷：其他货币资金-USDC钱包 / USDT钱包（按 token 自动）
  const debitAccount = params.debitAccount?.trim() || '管理费用-办公费';
  const creditAccount = params.creditAccount?.trim() || `其他货币资金-${expectedCurrency}钱包`;
  const summary = params.summary?.trim() || `${inst.title} · 报销付款`;
  const voucherDate = params.voucherDate ?? new Date().toISOString();

  const created = await prisma.$transaction(async (txDb) => {
    const voucher = await txDb.voucher.create({
      data: {
        date: new Date(voucherDate),
        summary,
        debitAccount,
        creditAccount,
        amount: expectedAmount,
        currency: expectedCurrency,
        notes:
          (params.notes ? `${params.notes}\n\n` : '') +
          `链上 hash: ${tx.hash}\n出账钱包: ${tx.from}\n收款钱包: ${tx.to}\n上链时间: ${new Date(txTimestampMs).toISOString()}`,
        vaultPath: params.vaultPath ?? null,
        status: 'AI_DRAFT',
        createdByAi: params.createdByAi ?? null,
        createdById: params.createdById ?? null,
        approvalInstanceId: inst.id,
      },
    });

    let proofs: unknown[] = [];
    if (inst.paymentProofs) {
      try {
        const parsedProofs = JSON.parse(inst.paymentProofs);
        if (Array.isArray(parsedProofs)) proofs = parsedProofs;
      } catch {
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

  return {
    ok: true,
    voucher: {
      id: created.id,
      voucherNumber: created.voucherNumber,
      status: created.status,
      amount: created.amount,
      currency: created.currency,
    },
    approvalInstanceId: inst.id,
    txHash: tx.hash,
    txUrl,
  };
}
