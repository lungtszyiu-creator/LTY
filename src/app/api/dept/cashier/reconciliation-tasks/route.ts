/**
 * 出纳 · 对账任务 AI API
 *
 * AI 用例：每月初 cron 调 POST 自动滚动当期 6 类对账任务，截止日 = 月末。
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireDeptAuthOrApiKey } from '@/lib/dept-access';

export async function GET(req: NextRequest) {
  const auth = await requireDeptAuthOrApiKey(req, 'cashier', [
    'CASHIER_AI:cashier_clerk',
    'CASHIER_AI:cfo',
    'CASHIER_READONLY',
  ]);
  if (auth instanceof NextResponse) return auth;
  const tasks = await prisma.cashierReconciliationTask.findMany({
    orderBy: { dueAt: 'asc' },
    take: 100,
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  return NextResponse.json({ tasks, _auth: auth.kind });
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  reconType: z.enum([
    'AD_CHANNEL',
    'AGENT_REBATE',
    'PLATFORM_FEE',
    'PAYROLL_SOCIAL',
    'BANK_DEPOSIT',
    'TAX_FILING',
    'OTHER',
  ]),
  cycle: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL']),
  ownerRole: z.string().max(100).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  dueAt: z.string().min(1),
  notes: z.string().max(2000).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const auth = await requireDeptAuthOrApiKey(
    req,
    'cashier',
    ['CASHIER_AI:cashier_clerk', 'CASHIER_AI:cfo'],
    'EDIT',
  );
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'VALIDATION_FAILED',
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const dueAt = new Date(d.dueAt);
  if (isNaN(dueAt.getTime())) {
    return NextResponse.json({ error: 'INVALID_DUE_DATE' }, { status: 400 });
  }
  const createdByAi = auth.kind === 'apikey' ? auth.ctx.scope : null;
  const created = await prisma.cashierReconciliationTask.create({
    data: {
      title: d.title,
      reconType: d.reconType,
      cycle: d.cycle,
      ownerRole: d.ownerRole?.trim() || null,
      description: d.description?.trim() || null,
      dueAt,
      notes: d.notes?.trim() || null,
      createdByAi,
    },
  });
  return NextResponse.json({ task: created, _auth: auth.kind }, { status: 201 });
}
