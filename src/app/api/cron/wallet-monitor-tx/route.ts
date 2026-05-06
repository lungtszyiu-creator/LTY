/**
 * 出纳钱包链上 outbound 监控 + 自动落账（A1 phase 完成版，2026-05-07）
 *
 * Vercel cron 每 10 分钟跑一次。逻辑：
 *  1. 自动 upsert 出纳钱包（hardcoded 0x1b3a77... 小许 / 许荣达），免老板手操
 *  2. 拉出纳钱包近期 USDC/USDT outbound transfer
 *  3. 跟 ChainTransaction 表比对找新 tx
 *  4. 每个新 outbound：尝试匹配 1 条 WAITING_PAYMENT 审批（amount + currency 严格一致 + 24h 内）
 *     - 找到 1 个 → 调 verifyAndPostChainPayment 落账（zero-touch 自动化）
 *     - 找到 0 / >1 → 创建 ChainTransaction 记录但不落账，留给老板手动 reply hash 兜底
 *  5. 推送链上记账员 bot 通知群里"已归集 N 笔，自动落账 M 条"
 *
 * 触发方式：Vercel cron 自动 + Authorization: Bearer ${CRON_SECRET}
 *
 * 设计哲学：
 *  - 出纳付款 → 5-10 分钟内系统自动落账（出纳/老板不用手动 reply hash）
 *  - reply hash 流程仍保留作为兜底（多笔合并 / 自动匹配失败时用）
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAndPostChainPayment } from '@/lib/financePaymentVerifier';

const ETHERSCAN_BASE = 'https://api.etherscan.io/v2/api';
const ETH_CHAIN_ID = '1';

// 出纳钱包（hardcoded，方便 cron 自检 + upsert）
const CASHIER_WALLET = {
  address: '0x1b3a77dCfb9c8DBb96511F8902360Bc1FA61F7FE',
  chain: 'ETH',
  label: '出纳 USDC 钱包（小许 / 许荣达）',
  holderType: 'COMPANY_CASHIER',
  notes: 'A1 phase 监控钱包：cron 每 10 分钟拉 outbound + 自动匹配 WAITING_PAYMENT 审批落账',
};

const TOKEN_CONTRACTS: Record<string, { address: string; decimals: number }> = {
  USDC: { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 },
  USDT: { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
};

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const got = req.headers.get('authorization');
  return got === `Bearer ${expected}`;
}

async function ensureCashierWalletRegistered(): Promise<{ id: string; address: string }> {
  const existing = await prisma.cryptoWallet.findUnique({
    where: { chain_address: { chain: CASHIER_WALLET.chain, address: CASHIER_WALLET.address } },
  });
  if (existing) {
    if (!existing.isActive || !existing.autoMonitor) {
      await prisma.cryptoWallet.update({
        where: { id: existing.id },
        data: { isActive: true, autoMonitor: true },
      });
    }
    return { id: existing.id, address: existing.address };
  }
  const created = await prisma.cryptoWallet.create({
    data: {
      label: CASHIER_WALLET.label,
      chain: CASHIER_WALLET.chain,
      address: CASHIER_WALLET.address,
      holderType: CASHIER_WALLET.holderType,
      autoMonitor: true,
      isActive: true,
      notes: CASHIER_WALLET.notes,
    },
  });
  console.log('[wallet-monitor-tx] cashier wallet auto-registered', created.id);
  return { id: created.id, address: created.address };
}

type EtherscanTokenTx = {
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenSymbol: string;
  tokenDecimal: string;
  timeStamp: string;
  blockNumber: string;
};

async function fetchOutbound(walletAddress: string, tokenSymbol: 'USDC' | 'USDT', apiKey: string): Promise<EtherscanTokenTx[]> {
  const contract = TOKEN_CONTRACTS[tokenSymbol];
  const params = new URLSearchParams({
    chainid: ETH_CHAIN_ID,
    module: 'account',
    action: 'tokentx',
    address: walletAddress,
    contractaddress: contract.address,
    startblock: '0',
    endblock: '99999999',
    sort: 'desc',
    page: '1',
    offset: '50',
    apikey: apiKey,
  });
  const res = await fetch(`${ETHERSCAN_BASE}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    console.error('[wallet-monitor-tx] etherscan http err', res.status);
    return [];
  }
  const j = (await res.json()) as { status?: string; result?: EtherscanTokenTx[] };
  if (j.status === '0' || !Array.isArray(j.result)) return [];
  // 仅 outbound（出纳钱包是 from）
  return j.result.filter((t) => t.from.toLowerCase() === walletAddress.toLowerCase());
}

type AutoPostResult = {
  txHash: string;
  outcome: 'POSTED' | 'NO_MATCH' | 'AMBIGUOUS' | 'ALREADY_POSTED' | 'ERROR';
  amount?: number;
  currency?: string;
  voucherId?: string;
  approvalInstanceId?: string;
  detail?: string;
};

async function tryAutoPostOutbound(
  tx: EtherscanTokenTx,
  cashierAddress: string,
): Promise<AutoPostResult> {
  const decimals = Number(tx.tokenDecimal);
  const amount = Number(BigInt(tx.value).toString()) / 10 ** decimals;
  const currency = tx.tokenSymbol.toUpperCase();
  const txAt = new Date(Number(tx.timeStamp) * 1000);
  // 24h 容忍窗口（刚发起的审批可能还没付，太早的就跳过）
  const since = new Date(txAt.getTime() - 24 * 60 * 60 * 1000);

  // 找 WAITING_PAYMENT 审批：amount + currency 严格匹配 + completedAt 在 24h 内
  const candidates = await prisma.approvalInstance.findMany({
    where: {
      aiPaymentStatus: 'WAITING_PAYMENT',
      status: 'APPROVED',
      template: { slug: 'finance-large-payment' },
      completedAt: { gte: since, lte: txAt },
    },
    include: { template: { select: { slug: true } } },
    take: 10,
  });

  const matches = candidates.filter((inst) => {
    let form: Record<string, unknown> = {};
    try {
      form = JSON.parse(inst.formJson || '{}');
    } catch {
      return false;
    }
    const fAmount = Number(form.amount);
    const fCurrency = String(form.currency ?? '').toUpperCase();
    return Number.isFinite(fAmount) && fAmount === amount && fCurrency === currency;
  });

  if (matches.length === 0) {
    return { txHash: tx.hash, outcome: 'NO_MATCH', amount, currency };
  }
  if (matches.length > 1) {
    return {
      txHash: tx.hash,
      outcome: 'AMBIGUOUS',
      amount,
      currency,
      detail: `${matches.length} candidates: ${matches.map((m) => m.id.slice(0, 8)).join(',')}`,
    };
  }

  const inst = matches[0];
  const result = await verifyAndPostChainPayment(inst, {
    txHash: tx.hash,
    senderAddress: cashierAddress,
    notes: `Auto-posted by wallet-monitor-tx cron at ${new Date().toISOString()}`,
    createdByAi: 'cron_wallet_monitor',
  });

  if (!result.ok) {
    return {
      txHash: tx.hash,
      outcome: 'ERROR',
      amount,
      currency,
      detail: result.error,
    };
  }
  return {
    txHash: tx.hash,
    outcome: 'POSTED',
    amount,
    currency,
    voucherId: result.voucher.id,
    approvalInstanceId: result.approvalInstanceId,
  };
}

async function notifyChainBookkeeper(content: string): Promise<void> {
  const baseUrl = process.env.FINANCE_BRIDGE_URL;
  const bridgeKey = process.env.FINANCE_BRIDGE_KEY;
  if (!baseUrl || !bridgeKey) return;
  try {
    await fetch(`${baseUrl.replace(/\/$/, '')}/webhook/finance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Key': bridgeKey },
      body: JSON.stringify({ role: '链上记账员', content }),
    });
  } catch (e) {
    console.error('[wallet-monitor-tx] tg notify failed', e);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ETHERSCAN_KEY_NOT_CONFIGURED' }, { status: 500 });
  }

  // 1. 出纳钱包自检 + 自动注册
  const cashier = await ensureCashierWalletRegistered();

  // 2. 拉 outbound USDC + USDT
  const allOutbound: EtherscanTokenTx[] = [];
  for (const symbol of ['USDC', 'USDT'] as const) {
    const txs = await fetchOutbound(cashier.address, symbol, apiKey);
    allOutbound.push(...txs);
  }

  // 3. 比对 ChainTransaction 表找新 tx
  const seenHashes = await prisma.chainTransaction.findMany({
    where: {
      chain: CASHIER_WALLET.chain,
      txHash: { in: allOutbound.map((t) => t.hash) },
    },
    select: { txHash: true },
  });
  const seenSet = new Set(seenHashes.map((s) => s.txHash));
  const newTxs = allOutbound.filter((t) => !seenSet.has(t.hash));

  // 4. 每笔新 outbound：创建 ChainTransaction + 尝试自动落账
  const results: AutoPostResult[] = [];
  for (const tx of newTxs) {
    const decimals = Number(tx.tokenDecimal);
    const amountDecimal = Number(BigInt(tx.value).toString()) / 10 ** decimals;
    try {
      await prisma.chainTransaction.create({
        data: {
          chain: CASHIER_WALLET.chain,
          txHash: tx.hash,
          timestamp: new Date(Number(tx.timeStamp) * 1000),
          fromWalletId: cashier.id,
          fromAddress: tx.from,
          toAddress: tx.to,
          amount: amountDecimal,
          token: tx.tokenSymbol.toUpperCase(),
          tokenContract: TOKEN_CONTRACTS[tx.tokenSymbol.toUpperCase()]?.address ?? null,
          tag: 'CASHIER_OUTBOUND',
          notes: `Auto-collected by wallet-monitor-tx cron`,
        },
      });
    } catch (e) {
      console.error('[wallet-monitor-tx] chainTx create err', tx.hash, e);
      // 继续尝试自动落账，即使 ChainTransaction 创建失败（可能 race）
    }

    const r = await tryAutoPostOutbound(tx, cashier.address);
    results.push(r);
  }

  // 5. 通知群（仅当有新 tx 处理）
  const posted = results.filter((r) => r.outcome === 'POSTED');
  const noMatch = results.filter((r) => r.outcome === 'NO_MATCH');
  const ambiguous = results.filter((r) => r.outcome === 'AMBIGUOUS');
  const errors = results.filter((r) => r.outcome === 'ERROR');

  if (results.length > 0) {
    const lines = [
      `<b>📡 链上监控归集报告</b>`,
      `<i>出纳钱包近期 outbound</i>`,
      `共 ${results.length} 笔新交易，自动落账 ${posted.length} 条`,
    ];
    if (posted.length > 0) {
      lines.push('');
      lines.push('<b>✅ 自动落账</b>');
      for (const p of posted) {
        lines.push(
          `· ${p.amount} ${p.currency} → 凭证 <code>${p.voucherId?.slice(0, 8)}</code> 关联审批 <code>${p.approvalInstanceId?.slice(0, 8)}</code>`,
        );
      }
    }
    if (noMatch.length > 0) {
      lines.push('');
      lines.push(`<b>⚠️ 无匹配审批 ${noMatch.length} 笔</b>（金额对不上任何 WAITING_PAYMENT，可能是非报销转账或合并支付）`);
      for (const n of noMatch.slice(0, 5)) {
        lines.push(`· ${n.amount} ${n.currency} hash <code>${n.txHash.slice(0, 10)}...</code>`);
      }
    }
    if (ambiguous.length > 0) {
      lines.push('');
      lines.push(`<b>⚠️ 多个候选审批</b>（${ambiguous.length} 笔，需人工指定）`);
      for (const a of ambiguous) {
        lines.push(`· ${a.amount} ${a.currency} ${a.detail}`);
      }
    }
    if (errors.length > 0) {
      lines.push('');
      lines.push(`<b>❌ 落账失败 ${errors.length} 笔</b>`);
      for (const e of errors) {
        lines.push(`· ${e.amount} ${e.currency} ${escapeHtml(e.detail ?? '')}`);
      }
    }
    await notifyChainBookkeeper(lines.join('\n'));
  }

  return NextResponse.json({
    ok: true,
    cashierWalletId: cashier.id,
    transactionsScanned: allOutbound.length,
    newTransactions: newTxs.length,
    autoPosted: posted.length,
    noMatch: noMatch.length,
    ambiguous: ambiguous.length,
    errors: errors.length,
    results,
  });
}
