/**
 * Etherscan 链上查询代理（ETH 主网）
 *
 * POST /api/finance/etherscan-query
 * Body: { action: 'balance' | 'tokenBalance' | 'txList' | 'tokenTxList', address: string, contractAddress?: string, limit?: number }
 *
 * 给链上记账员 / 对账员 / CFO 调，用于查 ETH 余额、代币余额、交易历史。
 * 需要 ETHERSCAN_API_KEY env（Vercel Settings → Environment Variables → Production）。
 *
 * 设计：薄代理 —— 不解释数据，原样返回 Etherscan 的 result 字段，让 AI 自己读。
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthOrApiKey } from '@/lib/api-auth';
import { logAiActivity } from '@/lib/ai-log';

const schema = z.object({
  action: z.enum(['balance', 'tokenBalance', 'txList', 'tokenTxList']),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'address must be a 0x-prefixed 40-hex string'),
  contractAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// Etherscan V2（V1 已弃用，2026 强制迁 V2）：
// 不同 chain 共用同 base path，chainid=1 = Ethereum mainnet
const ETHERSCAN_BASE = 'https://api.etherscan.io/v2/api';
const ETH_CHAIN_ID = '1';

export async function POST(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, [
    'FINANCE_AI:chain_bookkeeper',
    'FINANCE_AI:reconciler',
    'FINANCE_AI:cfo',
  ]);
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
  const { action, address, contractAddress, limit = 20 } = parsed.data;

  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'ETHERSCAN_KEY_NOT_CONFIGURED',
        message:
          'Add ETHERSCAN_API_KEY env var on Vercel (Production). Free tier from https://etherscan.io/apis.',
      },
      { status: 500 },
    );
  }

  // 按 action 装 query
  const params = new URLSearchParams();
  params.set('chainid', ETH_CHAIN_ID); // V2 必填
  params.set('apikey', apiKey);
  if (action === 'balance') {
    params.set('module', 'account');
    params.set('action', 'balance');
    params.set('address', address);
    params.set('tag', 'latest');
  } else if (action === 'tokenBalance') {
    if (!contractAddress) {
      return NextResponse.json(
        { error: 'CONTRACT_ADDRESS_REQUIRED', message: 'tokenBalance action needs contractAddress.' },
        { status: 400 },
      );
    }
    params.set('module', 'account');
    params.set('action', 'tokenbalance');
    params.set('address', address);
    params.set('contractaddress', contractAddress);
    params.set('tag', 'latest');
  } else if (action === 'txList') {
    params.set('module', 'account');
    params.set('action', 'txlist');
    params.set('address', address);
    params.set('startblock', '0');
    params.set('endblock', '99999999');
    params.set('sort', 'desc');
    params.set('page', '1');
    params.set('offset', String(limit));
  } else if (action === 'tokenTxList') {
    params.set('module', 'account');
    params.set('action', 'tokentx');
    params.set('address', address);
    if (contractAddress) params.set('contractaddress', contractAddress);
    params.set('startblock', '0');
    params.set('endblock', '99999999');
    params.set('sort', 'desc');
    params.set('page', '1');
    params.set('offset', String(limit));
  }

  const url = `${ETHERSCAN_BASE}?${params.toString()}`;
  const esRes = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!esRes.ok) {
    return NextResponse.json(
      {
        error: 'ETHERSCAN_FAILED',
        status: esRes.status,
        message: (await esRes.text()).slice(0, 300),
      },
      { status: 502 },
    );
  }

  const esJson = (await esRes.json()) as {
    status?: string;
    message?: string;
    result?: unknown;
  };

  // Etherscan 的 status === "0" 通常表示业务错误（API key 限额 / 无数据等）
  if (esJson.status === '0' && typeof esJson.result === 'string') {
    return NextResponse.json(
      {
        error: 'ETHERSCAN_BUSINESS_ERROR',
        message: esJson.message ?? 'unknown',
        result: esJson.result,
      },
      { status: 502 },
    );
  }

  if (auth.kind === 'apikey') {
    await logAiActivity({
      aiRole: auth.ctx.scope.split(':')[1] ?? 'unknown',
      action: `etherscan_${action}`,
      apiKeyId: auth.ctx.apiKeyId,
      payload: { address, contractAddress, limit },
    });
  }

  return NextResponse.json({
    action,
    address,
    contractAddress: contractAddress ?? null,
    result: esJson.result,
    source: 'ETHERSCAN',
    fetchedAt: new Date().toISOString(),
  });
}
