/**
 * 汇率 API
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuthOrApiKey } from '@/lib/api-auth';
import { logAiActivity } from '@/lib/ai-log';

export async function GET(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, [
    'FINANCE_AI:forex_lookout',
    'FINANCE_AI:reconciler',
    'FINANCE_AI:cfo',
    'FINANCE_READONLY',
  ]);

  const pair = req.nextUrl.searchParams.get('pair');
  const since = req.nextUrl.searchParams.get('since');
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? '100');

  const where: any = {};
  if (pair) where.pair = pair;
  if (since) where.date = { gte: new Date(since) };

  const rates = await prisma.fxRate.findMany({
    where,
    take: Math.min(limit, 500),
    orderBy: { date: 'desc' },
  });
  return NextResponse.json({ rates, _auth: auth.kind });
}

const createSchema = z.object({
  date: z.string().datetime(),
  pair: z.string().min(3).max(20),       // "USDT/HKD" / "USD/CNY"
  // rate 用 coerce 接受 number 或 string；string 入 Decimal 避免精度损失
  rate: z.coerce.string(),
  source: z.string().min(1).max(20),     // "COINGECKO" | "OKX" | "MSO" | "HKMA"
  isOfficial: z.coerce.boolean().optional(),
  notes: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, [
    'FINANCE_AI:forex_lookout',
    'FINANCE_AI:cfo',
  ], 'EDIT');

  const body = await req.json();
  const parseResult = createSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: 'VALIDATION_FAILED',
        issues: parseResult.error.issues.map((i) => ({ path: i.path, message: i.message })),
        received: body,
      },
      { status: 400 },
    );
  }
  const data = parseResult.data;

  // upsert：同一日同一 pair 同一 source 只有一条
  const rate = await prisma.fxRate.upsert({
    where: {
      date_pair_source: {
        date: new Date(data.date),
        pair: data.pair,
        source: data.source,
      },
    },
    create: {
      date: new Date(data.date),
      pair: data.pair,
      rate: data.rate,
      source: data.source,
      isOfficial: data.isOfficial ?? false,
      notes: data.notes ?? null,
      createdByAi: auth.kind === 'apikey' ? auth.ctx.scope.split(':')[1] || null : null,
    },
    update: {
      rate: data.rate,
      isOfficial: data.isOfficial ?? false,
      notes: data.notes ?? null,
    },
  });

  if (auth.kind === 'apikey') {
    await logAiActivity({
      aiRole: auth.ctx.scope.split(':')[1] ?? 'unknown',
      action: 'update_fx_rate',
      apiKeyId: auth.ctx.apiKeyId,
      fxRateId: rate.id,
      payload: { pair: data.pair, rate: data.rate, source: data.source },
    });
  }

  return NextResponse.json(rate, { status: 201 });
}
