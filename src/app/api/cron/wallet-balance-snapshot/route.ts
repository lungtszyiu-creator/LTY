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

async function snapshotOneWallet(wallet: { id: string; address: string }, apiKey: string) {
  const rows: Array<{
    walletId: string;
    token: string;
    tokenContract: string | null;
    amount: string;
  }> = [];

  // ETH 原生
  const ethRaw = await fetchEthBalance(wallet.address, apiKey);
  if (ethRaw !== null) {
    rows.push({
      walletId: wallet.id,
      token: 'ETH',
      tokenContract: null,
      amount: formatUnits(ethRaw, ETH_DECIMALS),
    });
  }

  // USDT / USDC
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

  if (rows.length > 0) {
    await prisma.walletBalanceSnapshot.createMany({ data: rows });
  }

  return rows.length;
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

  for (const w of wallets) {
    try {
      const n = await snapshotOneWallet(w, apiKey);
      totalRows += n;
      perWallet.push({ walletId: w.id, label: w.label, rowsCreated: n });
    } catch (e) {
      perWallet.push({
        walletId: w.id,
        label: w.label,
        rowsCreated: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    asOf: new Date().toISOString(),
    walletsScanned: wallets.length,
    totalSnapshotsCreated: totalRows,
    detail: perWallet,
  });
}

// Vercel cron 默认 GET，也允许 POST 让老板手动触发
export async function GET(req: NextRequest) {
  return runSnapshot(req);
}

export async function POST(req: NextRequest) {
  return runSnapshot(req);
}
