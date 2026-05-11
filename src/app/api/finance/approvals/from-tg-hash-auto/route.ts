/**
 * Hash-only 自动匹配落账（A4，2026-05-12）
 *
 * POST /api/finance/approvals/from-tg-hash-auto
 *
 * 用途：老板/出纳转账完，在 TG 群里随便说一句"已付 0x{hash}"或更短的指令，
 *  bridge 自动调本端点。本端点：
 *  1) 用 eth_getTransactionByHash 拿链上 tx 细节（from / to_contract / 解 input → recipient + amount）
 *  2) 反查 ApprovalInstance（status=APPROVED + aiPaymentStatus=WAITING_PAYMENT
 *     + template.slug=finance-large-payment + formJson.amount + currency 匹配）
 *  3) 唯一匹配 → 调 verifyAndPostChainPayment（lib 复用，严格 0 差异）
 *     多个匹配 → 返回候选列表让用户加 #cmXXX 指定
 *     无匹配 → 返回 NO_MATCH（hash 上链但找不到对应待付审批）
 *
 * 鉴权：X-Bridge-Key（跟 from-tg-payment 共用一把）
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { verifyAndPostChainPayment } from '@/lib/financePaymentVerifier';

const ETHERSCAN_BASE = 'https://api.etherscan.io/v2/api';
const ETH_CHAIN_ID = '1';

// 已知主网稳定币合约（小写）—— 用于反推 token symbol
const CONTRACTS_BY_LOWER: Record<string, string> = {
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
};

const schema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  fromTgUserId: z.number().int().positive().optional(),
});

// 解 ERC20 transfer(address _to, uint256 _value) 调用 input
// input = 0xa9059cbb + 32-byte _to + 32-byte _value
function parseErc20Transfer(input: string): { to: string; rawAmount: bigint } | null {
  const norm = input.toLowerCase();
  if (!norm.startsWith('0xa9059cbb')) return null;
  if (norm.length < 10 + 64 + 64) return null;
  // _to: bytes 10..74 (右 40 hex char 是地址)
  const toHex = '0x' + norm.slice(10 + 24, 10 + 64);
  // _value: bytes 74..138
  const valueHex = '0x' + norm.slice(10 + 64, 10 + 64 + 64);
  let rawAmount: bigint;
  try {
    rawAmount = BigInt(valueHex);
  } catch {
    return null;
  }
  return { to: toHex, rawAmount };
}

type ChainTxDetail = {
  from: string;
  contract: string;
  symbol: 'USDC' | 'USDT';
  decimals: number;
  toRecipient: string;
  amount: number; // human readable
};

async function fetchTxDetail(txHash: string): Promise<
  | { ok: true; tx: ChainTxDetail }
  | { ok: false; status: number; error: string; detail?: string }
> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) return { ok: false, status: 500, error: 'ETHERSCAN_KEY_NOT_CONFIGURED' };
  const params = new URLSearchParams({
    chainid: ETH_CHAIN_ID,
    module: 'proxy',
    action: 'eth_getTransactionByHash',
    txhash: txHash,
    apikey: apiKey,
  });
  const res = await fetch(`${ETHERSCAN_BASE}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return { ok: false, status: 502, error: 'ETHERSCAN_HTTP_ERROR' };
  const j = (await res.json()) as {
    result?: { from: string; to: string; input: string; value: string };
    error?: { message: string };
  };
  if (j.error) return { ok: false, status: 502, error: 'ETHERSCAN_ERROR', detail: j.error.message };
  const r = j.result;
  if (!r) return { ok: false, status: 404, error: 'TX_NOT_FOUND_ON_CHAIN' };
  // 必须是合约调用（ERC20 transfer）
  const symbol = CONTRACTS_BY_LOWER[r.to.toLowerCase()];
  if (!symbol) {
    return {
      ok: false,
      status: 400,
      error: 'NOT_USDC_USDT_TRANSFER',
      detail: `tx.to=${r.to} 不是已知 USDC/USDT 合约`,
    };
  }
  const parsed = parseErc20Transfer(r.input);
  if (!parsed) {
    return {
      ok: false,
      status: 400,
      error: 'INPUT_NOT_ERC20_TRANSFER',
      detail: 'tx.input 不符合 transfer(address,uint256) ABI',
    };
  }
  // USDC/USDT 主网都是 6 decimals
  const decimals = 6;
  const amount = Number(parsed.rawAmount) / 10 ** decimals;
  return {
    ok: true,
    tx: {
      from: r.from.toLowerCase(),
      contract: r.to.toLowerCase(),
      symbol: symbol as 'USDC' | 'USDT',
      decimals,
      toRecipient: parsed.to.toLowerCase(),
      amount,
    },
  };
}

export async function POST(req: NextRequest) {
  const got = req.headers.get('x-bridge-key') ?? '';
  const expected = process.env.FINANCE_BRIDGE_KEY ?? '';
  if (!expected) return NextResponse.json({ error: 'BRIDGE_KEY_NOT_CONFIGURED' }, { status: 500 });
  if (got !== expected) return NextResponse.json({ error: 'BAD_BRIDGE_KEY' }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { txHash, fromTgUserId } = parsed.data;

  // ① 链上拿 tx 详情
  const txResult = await fetchTxDetail(txHash);
  if (!txResult.ok) {
    return NextResponse.json(txResult, { status: txResult.status });
  }
  const tx = txResult.tx;

  // ② 先判定是否「内部钱包调拨」（老板 → 出纳 / 出纳 → 老板 / 储备账户互转）
  // 内部 holderType = BOSS / COMPANY_CASHIER / TREASURY。两端都是内部钱包就当调拨。
  const [fromWallet, toWallet] = await Promise.all([
    prisma.cryptoWallet.findFirst({
      where: {
        address: { equals: tx.from, mode: 'insensitive' },
        holderType: { in: ['BOSS', 'COMPANY_CASHIER', 'TREASURY'] },
        isActive: true,
      },
    }),
    prisma.cryptoWallet.findFirst({
      where: {
        address: { equals: tx.toRecipient, mode: 'insensitive' },
        holderType: { in: ['BOSS', 'COMPANY_CASHIER', 'TREASURY'] },
        isActive: true,
      },
    }),
  ]);

  if (fromWallet && toWallet) {
    // 内部调拨 - 自动建 voucher，不挂 PAYMENT 审批
    const voucher = await prisma.voucher.create({
      data: {
        date: new Date(),
        summary: `内部调拨：${fromWallet.label} → ${toWallet.label} ${tx.amount} ${tx.symbol}`,
        debitAccount: `其他货币资金-${toWallet.label}`,
        creditAccount: `其他货币资金-${fromWallet.label}`,
        amount: tx.amount,
        currency: tx.symbol,
        relatedTxIds: JSON.stringify([txHash]),
        status: 'AI_DRAFT',
        createdByAi: 'bridge_auto_hash',
        notes: `bridge hash-only 自动检测：tx.from=${tx.from} 是 ${fromWallet.holderType} 钱包（${fromWallet.label}），tx.to=${tx.toRecipient} 是 ${toWallet.holderType} 钱包（${toWallet.label}），判定为内部资金调拨。`,
      },
    });
    // 写 audit log
    await prisma.voucherAuditLog.create({
      data: {
        voucherId: voucher.id,
        action: 'create',
        byAi: 'bridge_auto_hash',
        beforeJson: null,
        afterJson: JSON.stringify({
          summary: voucher.summary,
          debitAccount: voucher.debitAccount,
          creditAccount: voucher.creditAccount,
          amount: voucher.amount.toString(),
          currency: voucher.currency,
        }),
        reason: '内部钱包调拨自动建凭证（hash-only 路径）',
      },
    });
    return NextResponse.json({
      ok: true,
      kind: 'internal_transfer',
      voucher: {
        id: voucher.id,
        voucherNumber: voucher.voucherNumber,
        status: voucher.status,
        amount: voucher.amount,
        currency: voucher.currency,
      },
      txHash,
      txUrl: `https://etherscan.io/tx/${txHash}`,
      autoMatch: {
        fromWalletLabel: fromWallet.label,
        toWalletLabel: toWallet.label,
        amountMatched: tx.amount,
        currencyMatched: tx.symbol,
      },
    });
  }

  // ③ 查 WAITING_PAYMENT 待付审批
  const candidates = await prisma.approvalInstance.findMany({
    where: {
      status: 'APPROVED',
      aiPaymentStatus: 'WAITING_PAYMENT',
      template: { slug: 'finance-large-payment' },
    },
    include: { template: { select: { slug: true, name: true } } },
  });

  // ③ 解 formJson + 在内存里 fuzzy 匹配：amount + currency
  type Match = {
    inst: (typeof candidates)[number];
    amount: number;
    currency: string;
    targetWallet: string | null;
  };
  const matches: Match[] = [];
  for (const inst of candidates) {
    let form: Record<string, unknown> = {};
    try {
      form = JSON.parse(inst.formJson || '{}');
    } catch {
      continue;
    }
    const formAmount = Number(form.amount);
    const formCurrency = String(form.currency ?? '').toUpperCase();
    if (!Number.isFinite(formAmount) || formAmount <= 0) continue;
    if (formCurrency !== tx.symbol) continue;
    // 严格 0 差异（同 verifier 标准）
    if (Math.abs(formAmount - tx.amount) > 0.00001) continue;
    // 找 form 里可能的钱包字段（不同模板字段名不一）
    const candidateWalletKeys = ['target_wallet', 'receiver_wallet', 'recipient_wallet', '钱包', 'wallet', 'to_wallet'];
    let targetWallet: string | null = null;
    for (const k of candidateWalletKeys) {
      const v = form[k];
      if (typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v)) {
        targetWallet = v.toLowerCase();
        break;
      }
    }
    // 钱包不匹配时降级到金额+币种匹配也算候选；钱包匹配的优先
    matches.push({ inst, amount: formAmount, currency: formCurrency, targetWallet });
  }

  if (matches.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'NO_MATCHING_APPROVAL',
        chainTx: { amount: tx.amount, currency: tx.symbol, from: tx.from, to: tx.toRecipient },
        message: `链上交易 ${tx.amount} ${tx.symbol} 找到了，但没匹配到任何 WAITING_PAYMENT 审批。可能：1) 转早了没批；2) 金额跟审批不一致；3) 已经落账过了。`,
      },
      { status: 404 },
    );
  }

  // 钱包匹配优先：先看有没有钱包对得上的
  const walletPreferred = matches.filter(
    (m) => m.targetWallet && m.targetWallet === tx.toRecipient,
  );
  const finalCandidates = walletPreferred.length > 0 ? walletPreferred : matches;

  if (finalCandidates.length > 1) {
    return NextResponse.json(
      {
        ok: false,
        error: 'MULTIPLE_CANDIDATES',
        chainTx: { amount: tx.amount, currency: tx.symbol, to: tx.toRecipient },
        candidates: finalCandidates.map((m) => ({
          instanceId: m.inst.id,
          cuidPrefix: '#' + m.inst.id.slice(0, 8),
          title: m.inst.title,
        })),
        message: `匹配到 ${finalCandidates.length} 笔金额/币种相同的待付审批。请在消息里加 #cmXXX 前 8 位指定具体哪笔，或者老板进看板手动处理。`,
      },
      { status: 409 },
    );
  }

  // ④ 唯一匹配 → 调 lib 落账
  const inst = finalCandidates[0].inst;
  const result = await verifyAndPostChainPayment(inst, {
    txHash,
    senderAddress: tx.from,
    createdByAi: 'bridge_auto_hash',
    notes:
      `bridge hash-only 自动匹配落账。\n` +
      `匹配依据：amount=${tx.amount} ${tx.symbol}` +
      (finalCandidates[0].targetWallet === tx.toRecipient ? ' + 钱包地址 100% 匹配' : ' （钱包未匹配，按金额币种唯一性）') +
      `\nfromTgUserId=${fromTgUserId ?? 'unknown'}`,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status });
  }
  return NextResponse.json({
    ok: true,
    voucher: result.voucher,
    approvalInstanceId: result.approvalInstanceId,
    txHash: result.txHash,
    txUrl: result.txUrl,
    autoMatch: {
      amountMatched: tx.amount,
      currencyMatched: tx.symbol,
      walletMatched: finalCandidates[0].targetWallet === tx.toRecipient,
      instanceTitle: inst.title,
    },
  });
}
