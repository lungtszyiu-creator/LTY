/**
 * CoinGecko 加密货币行情代理
 *
 * POST /api/finance/coingecko-rate
 * Body: { coinId: string, vsCurrency?: string }
 *
 * 给汇率瞭望员 / 对账员 / CFO 调，用来取 USDT/USDC/ETH 等代币的市场价。
 * 经我们后端代理是为了：
 *   1. 统一 API key 鉴权（未来如果换源不影响 Coze plugin URL）
 *   2. 写 AI 活动日志，跟其他财务 AI 行为一致
 *
 * CoinGecko 免费层 ~30 calls/min，足够 5 AI 用。
 * 如未来要升级 Demo / Pro，加 COINGECKO_API_KEY env 即可。
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthOrApiKey } from '@/lib/api-auth';
import { logAiActivity } from '@/lib/ai-log';

const schema = z.object({
  coinId: z.string().min(1).max(50),
  vsCurrency: z.string().min(2).max(10).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, [
    'FINANCE_AI:forex_lookout',
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
  const { coinId, vsCurrency = 'usd' } = parsed.data;

  const apiKey = process.env.COINGECKO_API_KEY;
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=${encodeURIComponent(vsCurrency)}&include_last_updated_at=true`;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) headers['x-cg-demo-api-key'] = apiKey;

  const cgRes = await fetch(url, { headers });
  if (!cgRes.ok) {
    return NextResponse.json(
      {
        error: 'COINGECKO_FAILED',
        status: cgRes.status,
        message: (await cgRes.text()).slice(0, 300),
      },
      { status: 502 },
    );
  }

  const cgJson = (await cgRes.json()) as Record<string, Record<string, number>>;
  const inner = cgJson[coinId];
  if (!inner) {
    return NextResponse.json(
      {
        error: 'COIN_NOT_FOUND',
        message: `coinId "${coinId}" not recognized by CoinGecko. Try lowercase slugs: tether / usd-coin / ethereum / bitcoin / tron.`,
      },
      { status: 404 },
    );
  }
  const rate = inner[vsCurrency];
  const lastUpdated = inner.last_updated_at;

  if (typeof rate !== 'number') {
    return NextResponse.json(
      {
        error: 'VS_CURRENCY_NOT_FOUND',
        message: `vsCurrency "${vsCurrency}" not available. Try usd / hkd / cny / eur.`,
      },
      { status: 404 },
    );
  }

  if (auth.kind === 'apikey') {
    await logAiActivity({
      aiRole: auth.ctx.scope.split(':')[1] ?? 'unknown',
      action: 'query_coingecko_rate',
      apiKeyId: auth.ctx.apiKeyId,
      payload: { coinId, vsCurrency, rate },
    });
  }

  return NextResponse.json({
    coinId,
    vsCurrency,
    rate,
    source: 'COINGECKO',
    fetchedAt: new Date().toISOString(),
    coingeckoLastUpdatedAt: lastUpdated ? new Date(lastUpdated * 1000).toISOString() : null,
  });
}
