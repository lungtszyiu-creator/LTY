/**
 * 钱包余额定时归集 Cron
 *
 * Vercel cron 每日 UTC 00:00 触发。对每个 active CryptoWallet（仅 ETH 主网当前实现），
 * 调 Etherscan V2 API 拉 ETH / USDT / USDC 余额，存进 WalletBalanceSnapshot 表。
 *
 * 触发方式：Vercel cron 自动加 `Authorization: Bearer ${CRON_SECRET}` header。
 * 本端点验证 secret 防外部恶意触发。手动触发可走 Vercel UI 的 "Run cron" 按钮。
 *
 * 也接受 POST + Authorization：Bearer ${CRON_SECRET} 方便老板手动跑一次。
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const ETHERSCAN_BASE = 'https://api.etherscan.io/v2/api';
const ETH_CHAIN_ID = '1';

// ETH 主网 USDT / USDC 合约
const TOKEN_CONTRACTS: Record<string, { address: string; decimals: number }> = {
  USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
  USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
};

const ETH_DECIMALS = 18;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false; // 没设 secret 就绝对禁止
  const got = req.headers.get('authorization');
  return got === `Bearer ${expected}`;
}

// 把 wei / 最小单位 字符串转成人类可读小数串
// e.g. "1234567890000000000" + 18 → "1.23456789"
function formatUnits(raw: string, decimals: number): string {
  if (!raw || raw === '0') return '0';
  const padded = raw.padStart(decimals + 1, '0');
  const intPart = padded.slice(0, padded.length - decimals);
  const fracPart = padded.slice(padded.length - decimals).replace(/0+$/, '');
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

async function etherscanGet(params: URLSearchParams): Promise<{
  status?: string;
  result?: unknown;
  message?: string;
}> {
  const url = `${ETHERSCAN_BASE}?${params.toString()}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Etherscan ${res.status}`);
  }
  return res.json() as Promise<{ status?: string; result?: unknown; message?: string }>;
}

async function fetchEthBalance(address: string, apiKey: string): Promise<string | null> {
  const params = new URLSearchParams({
    chainid: ETH_CHAIN_ID,
    module: 'account',
    action: 'balance',
    address,
    tag: 'latest',
    apikey: apiKey,
  });
  const j = await etherscanGet(params);
  if (j.status === '0' && typeof j.result === 'string') {
    console.warn(`[cron/wallet-balance] ETH balance failed ${address}: ${j.message} ${j.result}`);
    return null;
  }
  return typeof j.result === 'string' ? j.result : null;
}

async function fetchTokenBalance(
  address: string,
  contract: string,
  apiKey: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    chainid: ETH_CHAIN_ID,
    module: 'account',
    action: 'tokenbalance',
    address,
    contractaddress: contract,
    tag: 'latest',
    apikey: apiKey,
  });
  const j = await etherscanGet(params);
  if (j.status === '0' && typeof j.result === 'string') {
    console.warn(`[cron/wallet-balance] token balance failed ${address}/${contract}: ${j.message}`);
    return null;
  }
  return typeof j.result === 'string' ? j.result : null;
}

type SnapRow = {
  walletId: string;
  token: string;
  tokenContract: string | null;
  amount: string;
};

type SnapWithPrev = SnapRow & { prevAmount: string | null };

async function snapshotOneWallet(
  wallet: { id: string; address: string },
  apiKey: string,
): Promise<SnapWithPrev[]> {
  const rows: SnapRow[] = [];

  const ethRaw = await fetchEthBalance(wallet.address, apiKey);
  if (ethRaw !== null) {
    rows.push({
      walletId: wallet.id,
      token: 'ETH',
      tokenContract: null,
      amount: formatUnits(ethRaw, ETH_DECIMALS),
    });
  }

  for (const [token, meta] of Object.entries(TOKEN_CONTRACTS)) {
    const raw = await fetchTokenBalance(wallet.address, meta.address, apiKey);
    if (raw !== null) {
      rows.push({
        walletId: wallet.id,
        token,
        tokenContract: meta.address,
        amount: formatUnits(raw, meta.decimals),
      });
    }
  }

  // 写库前先查每个 (wallet, token) 的上一次快照，用来算 delta
  const withPrev: SnapWithPrev[] = await Promise.all(
    rows.map(async (r) => {
      const prev = await prisma.walletBalanceSnapshot.findFirst({
        where: { walletId: r.walletId, token: r.token },
        orderBy: { asOf: 'desc' },
        select: { amount: true },
      });
      return { ...r, prevAmount: prev?.amount ?? null };
    }),
  );

  if (rows.length > 0) {
    await prisma.walletBalanceSnapshot.createMany({ data: rows });
  }

  return withPrev;
}

// 算 delta：返 "+1.23" / "-0.5" / null（首日或 0 变动）
function formatDelta(current: string, prev: string | null): string | null {
  if (prev === null) return null; // 首日
  const c = parseFloat(current);
  const p = parseFloat(prev);
  if (!Number.isFinite(c) || !Number.isFinite(p)) return null;
  const d = c - p;
  if (Math.abs(d) < 1e-9) return null; // 无变动
  return d > 0 ? `+${d.toLocaleString('en-US', { maximumFractionDigits: 6 })}` : d.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

// HK 时区时间（cron UTC 00:00 = HKT 08:00）
function hktTimeStr(d: Date): string {
  const hkOffsetMs = 8 * 3600 * 1000;
  const hk = new Date(d.getTime() + hkOffsetMs);
  return hk.toISOString().replace('T', ' ').slice(0, 16);
}

// 推送日报到 TG（finance_bridge）
async function sendDailyDigest(
  perWalletData: Array<{ label: string; chain: string; rows: SnapWithPrev[] }>,
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const bridgeKey = process.env.BRIDGE_KEY;
  const bridgeUrl =
    process.env.FINANCE_BRIDGE_URL ?? 'https://yoyodemacbook-pro.tail2206a1.ts.net/webhook/finance';

  if (!bridgeKey) {
    return { ok: false, skipped: true, error: 'BRIDGE_KEY not set, daily digest skipped' };
  }

  // 拼消息
  const lines: string[] = [];
  lines.push(`📊 钱包余额日报 · ${hktTimeStr(new Date())} HKT`);
  lines.push('');

  if (perWalletData.length === 0) {
    lines.push('⚠️ 当前没有 autoMonitor=true 的钱包可监控。');
  } else {
    for (const w of perWalletData) {
      lines.push(`🔹 ${w.label}（${w.chain}）`);
      if (w.rows.length === 0) {
        lines.push('  抓取失败或全 0');
      } else {
        for (const r of w.rows) {
          const delta = formatDelta(r.amount, r.prevAmount);
          const tag = delta ? ` (${delta})` : r.prevAmount === null ? ' （首日）' : '';
          lines.push(`  ${r.token.padEnd(5)} ${r.amount}${tag}`);
        }
      }
      lines.push('');
    }
  }

  lines.push(`✅ ${perWalletData.length} 个钱包扫描完成 · 来源 Etherscan V2`);

  const content = lines.join('\n');

  try {
    const res = await fetch(bridgeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Key': bridgeKey,
      },
      body: JSON.stringify({ role: '链上记账员', content }),
    });
    if (!res.ok) {
      return { ok: false, error: `bridge ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function runSnapshot(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ETHERSCAN_KEY_NOT_CONFIGURED' },
      { status: 500 },
    );
  }

  // 只跑：active + autoMonitor=true + ETH 链
  // autoMonitor=false 通常是老板个人钱包（混私人/公司流水，不能无差别监控）
  const wallets = await prisma.cryptoWallet.findMany({
    where: {
      isActive: true,
      autoMonitor: true,
      chain: { in: ['ETH', 'eth', 'ethereum'] },
    },
    select: { id: true, address: true, label: true },
  });

  let totalRows = 0;
  const perWallet: Array<{ walletId: string; label: string; rowsCreated: number; error?: string }> = [];
  // 给日报用：每个钱包的 label / chain / 抓回来的 row
  const digestData: Array<{ label: string; chain: string; rows: SnapWithPrev[] }> = [];

  // wallets 没带 chain，重新拉
  const walletsFull = await prisma.cryptoWallet.findMany({
    where: { id: { in: wallets.map((w) => w.id) } },
    select: { id: true, label: true, chain: true },
  });
  const chainByWalletId = new Map(walletsFull.map((w) => [w.id, w.chain]));

  for (const w of wallets) {
    try {
      const rows = await snapshotOneWallet(w, apiKey);
      totalRows += rows.length;
      perWallet.push({ walletId: w.id, label: w.label, rowsCreated: rows.length });
      digestData.push({
        label: w.label,
        chain: chainByWalletId.get(w.id) ?? 'ETH',
        rows,
      });
    } catch (e) {
      perWallet.push({
        walletId: w.id,
        label: w.label,
        rowsCreated: 0,
        error: e instanceof Error ? e.message : String(e),
      });
      digestData.push({ label: w.label, chain: chainByWalletId.get(w.id) ?? 'ETH', rows: [] });
    }
  }

  // 顺手发 TG 日报（失败不影响主流程）
  const digestResult = await sendDailyDigest(digestData);

  return NextResponse.json({
    ok: true,
    asOf: new Date().toISOString(),
    walletsScanned: wallets.length,
    totalSnapshotsCreated: totalRows,
    detail: perWallet,
    digest: digestResult,
  });
}

// Vercel cron 默认 GET，也允许 POST 让老板手动触发
export async function GET(req: NextRequest) {
  return runSnapshot(req);
}

export async function POST(req: NextRequest) {
  return runSnapshot(req);
}
