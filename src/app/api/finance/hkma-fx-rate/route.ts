/**
 * HKMA 香港金管局官方汇率代理
 *
 * POST /api/finance/hkma-fx-rate
 * Body: { currency: string, date?: string }
 *
 * 取香港金管局每日官方挂牌价。给汇率瞭望员 / CFO 调，用于做账时引用官方汇率
 * （比 CoinGecko 等市场源更"硬"，会计政策上更安全）。
 *
 * HKMA 公共数据 API 不要 key，无 rate limit 顾虑。
 * 端点：https://api.hkma.gov.hk/public/market-data-and-statistics/daily-monetary-statistics/daily-figures-interbank-liquidity
 * 实际汇率 endpoint：daily figures of HKD spot exchange rates。
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthOrApiKey } from '@/lib/api-auth';
import { logAiActivity } from '@/lib/ai-log';

const schema = z.object({
  currency: z.string().min(2).max(5),
  // YYYY-MM-DD; 默认拉最近一天
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .optional(),
});

const HKMA_BASE =
  'https://api.hkma.gov.hk/public/market-data-and-statistics/daily-monetary-statistics/daily-figures-interbank-liquidity';
// HKMA 实际的"汇率"endpoint：
const HKMA_FX_ENDPOINT =
  'https://api.hkma.gov.hk/public/market-data-and-statistics/daily-monetary-statistics/daily-spot-exchange-rates';

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
  const { currency, date } = parsed.data;
  const upper = currency.toUpperCase();

  // HKMA 用 from / to 限定日期；不传就拉最近 7 天再选最新
  const params = new URLSearchParams();
  if (date) {
    params.set('from', date);
    params.set('to', date);
  } else {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 3600 * 1000);
    params.set('from', weekAgo.toISOString().slice(0, 10));
    params.set('to', today.toISOString().slice(0, 10));
  }
  params.set('pagesize', '50');
  params.set('sortby', 'end_of_date');
  params.set('sortorder', 'desc');

  const url = `${HKMA_FX_ENDPOINT}?${params.toString()}`;
  const hkmaRes = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!hkmaRes.ok) {
    return NextResponse.json(
      {
        error: 'HKMA_FAILED',
        status: hkmaRes.status,
        url,
        message: (await hkmaRes.text()).slice(0, 300),
      },
      { status: 502 },
    );
  }

  const hkmaJson = (await hkmaRes.json()) as {
    result?: {
      records?: Array<{ end_of_date: string; currency: string; rate: number | string }>;
    };
  };
  const records = hkmaJson?.result?.records ?? [];

  // 找匹配 currency 的最新一条
  const match = records.find((r) => (r.currency ?? '').toUpperCase() === upper);

  if (!match) {
    return NextResponse.json(
      {
        error: 'CURRENCY_NOT_FOUND',
        message: `HKMA records didn't contain currency "${upper}" in the requested window. Common values: USD / EUR / GBP / JPY / CNY / SGD.`,
        availableInWindow: Array.from(new Set(records.map((r) => r.currency))).slice(0, 20),
      },
      { status: 404 },
    );
  }

  const rate = typeof match.rate === 'string' ? parseFloat(match.rate) : match.rate;

  if (auth.kind === 'apikey') {
    await logAiActivity({
      aiRole: auth.ctx.scope.split(':')[1] ?? 'unknown',
      action: 'query_hkma_fx_rate',
      apiKeyId: auth.ctx.apiKeyId,
      payload: { currency: upper, date: match.end_of_date, rate },
    });
  }

  return NextResponse.json({
    currency: upper,
    rate,
    asOf: match.end_of_date,
    source: 'HKMA',
    isOfficial: true,
    fetchedAt: new Date().toISOString(),
  });
}
