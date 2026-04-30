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

// HKMA 实际汇率 endpoint：6.1.3 Exchange rates – Daily
// 一条记录包含所有币种字段（usd, gbp, jpy, cad, aud, sgd, eur, cny, ...），
// end_of_day 为日期。返回的 rate 是 "1 unit of <ccy> = N HKD" 的中间价。
const HKMA_FX_ENDPOINT =
  'https://api.hkma.gov.hk/public/market-data-and-statistics/monthly-statistical-bulletin/er-ir/er-eeri-daily';

const SUPPORTED_CCY = [
  'usd', 'gbp', 'jpy', 'cad', 'aud', 'sgd', 'twd', 'chf',
  'cny', 'krw', 'thb', 'myr', 'eur', 'php', 'inr', 'idr', 'zar',
] as const;

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
  const lower = currency.toLowerCase();
  const upper = currency.toUpperCase();

  if (!SUPPORTED_CCY.includes(lower as (typeof SUPPORTED_CCY)[number])) {
    return NextResponse.json(
      {
        error: 'CURRENCY_NOT_SUPPORTED',
        message: `HKMA only publishes daily rates for: ${SUPPORTED_CCY.map((c) => c.toUpperCase()).join(', ')}.`,
      },
      { status: 400 },
    );
  }

  // HKMA 用 from / to 限定日期；不传就拉最近 14 天兜住周末/假期
  const params = new URLSearchParams();
  if (date) {
    params.set('from', date);
    params.set('to', date);
  } else {
    const today = new Date();
    const twoWeeksAgo = new Date(today.getTime() - 14 * 24 * 3600 * 1000);
    params.set('from', twoWeeksAgo.toISOString().slice(0, 10));
    params.set('to', today.toISOString().slice(0, 10));
  }
  params.set('pagesize', '50');
  // HKMA 默认就是按 end_of_day 降序（最新在前），手动 sortby 反而报错。
  params.set('fields', `end_of_day,${lower}`);

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
    header?: { success?: boolean; err_code?: string; err_msg?: string };
    result?: {
      records?: Array<Record<string, string | number | null>>;
    };
  };
  if (hkmaJson?.header?.success === false) {
    return NextResponse.json(
      {
        error: 'HKMA_BUSINESS_ERROR',
        err_code: hkmaJson.header.err_code,
        err_msg: hkmaJson.header.err_msg,
      },
      { status: 502 },
    );
  }
  const records = hkmaJson?.result?.records ?? [];

  // 找最新一条 currency 字段非空的记录（HKMA 周末 / 假期不公布，会缺数据）
  const match = records.find((r) => r[lower] != null && r[lower] !== '');

  if (!match) {
    return NextResponse.json(
      {
        error: 'NO_DATA_IN_WINDOW',
        message: `HKMA didn't publish ${upper} rate in the requested window. Try widening date range, or weekends/holidays may have no data.`,
        windowStart: params.get('from'),
        windowEnd: params.get('to'),
      },
      { status: 404 },
    );
  }

  const rawRate = match[lower];
  const rate = typeof rawRate === 'string' ? parseFloat(rawRate) : (rawRate as number);
  const asOf = match.end_of_day as string;

  if (auth.kind === 'apikey') {
    await logAiActivity({
      aiRole: auth.ctx.scope.split(':')[1] ?? 'unknown',
      action: 'query_hkma_fx_rate',
      apiKeyId: auth.ctx.apiKeyId,
      payload: { currency: upper, asOf, rate },
    });
  }

  return NextResponse.json({
    currency: upper,
    rate,
    asOf,
    source: 'HKMA',
    isOfficial: true,
    note: 'Rate represents 1 unit of foreign currency = N HKD (HKMA daily mid-rate).',
    fetchedAt: new Date().toISOString(),
  });
}
