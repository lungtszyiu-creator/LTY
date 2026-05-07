/**
 * 出纳 · 合规台账 AI API
 *
 * ⭐ POST 时 AI 默认 dualLayer='REAL'；如需 'COMPLIANCE' 必须显式传，
 * 防止 AI 默认建合规外壳条目带来 ledger 污染（feedback_lty_legal_dual_layer）。
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
  const category = req.nextUrl.searchParams.get('category');
  const where: Record<string, unknown> = {};
  if (category) where.category = category;
  const entries = await prisma.cashierComplianceEntry.findMany({
    where,
    orderBy: [{ category: 'asc' }, { nextDueAt: 'asc' }],
    take: 200,
  });
  return NextResponse.json({ entries, _auth: auth.kind });
}

const createSchema = z.object({
  category: z.enum(['TAX', 'LICENSE', 'BANK_ACCOUNT', 'EXCHANGE_ACCOUNT', 'FIXED_ASSET']),
  name: z.string().min(1).max(200),
  identifier: z.string().max(200).optional().nullable(),
  cycle: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL', 'ADHOC']).optional().nullable(),
  nextDueAt: z.string().optional().nullable(),
  responsibleName: z.string().max(100).optional().nullable(),
  // ⭐ AI 默认 REAL；显式传才能进 COMPLIANCE
  dualLayer: z.enum(['REAL', 'COMPLIANCE', 'BOTH']).default('REAL'),
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
  const createdByAi = auth.kind === 'apikey' ? auth.ctx.scope : null;
  const created = await prisma.cashierComplianceEntry.create({
    data: {
      category: d.category,
      name: d.name,
      identifier: d.identifier?.trim() || null,
      cycle: d.cycle || null,
      nextDueAt: d.nextDueAt ? new Date(d.nextDueAt) : null,
      responsibleName: d.responsibleName?.trim() || null,
      dualLayer: d.dualLayer,
      notes: d.notes?.trim() || null,
      createdByAi,
    },
  });
  return NextResponse.json({ entry: created, _auth: auth.kind }, { status: 201 });
}
