/**
 * 出纳 · 报销 AI API
 *
 * GET 列表：人 session / CASHIER_AI:* / CASHIER_READONLY
 * POST AI 创建（applicantId 必填，AI 帮某员工录）：CASHIER_AI:cashier_clerk / CASHIER_AI:cfo / CASHIER_ADMIN
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
  const status = req.nextUrl.searchParams.get('status');
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '50'), 200);
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  const reimbs = await prisma.cashierReimbursement.findMany({
    where,
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      applicant: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
    },
  });
  return NextResponse.json({ reimbursements: reimbs, _auth: auth.kind });
}

const createSchema = z.object({
  applicantId: z.string().min(1),
  category: z.enum(['TRAVEL', 'MEAL', 'OFFICE', 'TRAINING', 'OTHER']),
  title: z.string().min(1).max(200),
  amount: z.coerce.number().positive(),
  currency: z.enum(['HKD', 'CNY', 'USD']),
  occurredOn: z.string().optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  reason: z.string().max(2000).optional().nullable(),
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
        received: body,
      },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const applicant = await prisma.user.findUnique({
    where: { id: d.applicantId },
    select: { id: true, active: true },
  });
  if (!applicant || !applicant.active) {
    return NextResponse.json({ error: 'APPLICANT_NOT_FOUND' }, { status: 400 });
  }
  const createdByAi = auth.kind === 'apikey' ? auth.ctx.scope : null;
  const created = await prisma.cashierReimbursement.create({
    data: {
      applicantId: d.applicantId,
      category: d.category,
      title: d.title,
      amount: d.amount.toString(),
      currency: d.currency,
      occurredOn: d.occurredOn ? new Date(d.occurredOn) : null,
      department: d.department?.trim() || null,
      reason: d.reason?.trim() || null,
      notes: d.notes?.trim() || null,
      status: 'PENDING',
      createdByAi,
    },
  });
  return NextResponse.json({ reimbursement: created, _auth: auth.kind }, { status: 201 });
}
