/**
 * 单张凭证 API
 *
 * GET   /api/finance/vouchers/[id]  — 详情
 * PATCH /api/finance/vouchers/[id]  — 老板审批：approve / reject / void
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuthOrApiKey } from '@/lib/api-auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthOrApiKey(req, [
    'FINANCE_AI:voucher_clerk',
    'FINANCE_AI:cfo',
    'FINANCE_READONLY',
  ]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const voucher = await prisma.voucher.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      postedBy: { select: { id: true, name: true, email: true } },
      approvalInstance: { select: { id: true, status: true, title: true } },
    },
  });

  if (!voucher) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  return NextResponse.json(voucher);
}

const patchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('reject'), reason: z.string().min(1).max(2000) }),
  z.object({ action: z.literal('void'), reason: z.string().min(1).max(2000) }),
]);

// 生成凭证号 V-YYYYMM-NNN（按凭证 date 月份分流水）
async function generateVoucherNumber(voucherDate: Date): Promise<string> {
  const yyyymm = `${voucherDate.getFullYear()}${String(voucherDate.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `V-${yyyymm}-`;
  const last = await prisma.voucher.findFirst({
    where: { voucherNumber: { startsWith: prefix } },
    orderBy: { voucherNumber: 'desc' },
    select: { voucherNumber: true },
  });
  const nextSeq = last?.voucherNumber
    ? parseInt(last.voucherNumber.slice(prefix.length), 10) + 1
    : 1;
  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 审批仅老板（EDITOR session 或 FINANCE_ADMIN scope）
  const auth = await requireAuthOrApiKey(req, ['FINANCE_ADMIN'], 'EDIT');
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'VALIDATION_FAILED',
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      { status: 400 },
    );
  }

  const voucher = await prisma.voucher.findUnique({ where: { id } });
  if (!voucher) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const userId = auth.kind === 'session' ? auth.userId : null;
  const data = parsed.data;
  const now = new Date();

  // 状态机校验
  if (data.action === 'approve') {
    if (voucher.status !== 'AI_DRAFT' && voucher.status !== 'BOSS_REVIEWING') {
      return NextResponse.json(
        { error: 'INVALID_TRANSITION', from: voucher.status, to: 'POSTED' },
        { status: 409 },
      );
    }
    const voucherNumber = await generateVoucherNumber(voucher.date);
    const updated = await prisma.voucher.update({
      where: { id },
      data: {
        status: 'POSTED',
        voucherNumber,
        postedAt: now,
        postedById: userId,
      },
    });
    return NextResponse.json(updated);
  }

  if (data.action === 'reject') {
    if (voucher.status !== 'AI_DRAFT' && voucher.status !== 'BOSS_REVIEWING') {
      return NextResponse.json(
        { error: 'INVALID_TRANSITION', from: voucher.status, to: 'REJECTED' },
        { status: 409 },
      );
    }
    const updated = await prisma.voucher.update({
      where: { id },
      data: {
        status: 'REJECTED',
        notes: voucher.notes
          ? `${voucher.notes}\n\n[REJECTED at ${now.toISOString()}]: ${data.reason}`
          : `[REJECTED at ${now.toISOString()}]: ${data.reason}`,
      },
    });
    return NextResponse.json(updated);
  }

  // void
  if (voucher.status !== 'POSTED') {
    return NextResponse.json(
      { error: 'INVALID_TRANSITION', from: voucher.status, to: 'VOIDED' },
      { status: 409 },
    );
  }
  const updated = await prisma.voucher.update({
    where: { id },
    data: {
      status: 'VOIDED',
      notes: voucher.notes
        ? `${voucher.notes}\n\n[VOIDED at ${now.toISOString()}]: ${data.reason}`
        : `[VOIDED at ${now.toISOString()}]: ${data.reason}`,
    },
  });
  return NextResponse.json(updated);
}
