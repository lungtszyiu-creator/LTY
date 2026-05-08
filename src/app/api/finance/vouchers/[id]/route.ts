/**
 * 单张凭证 API
 *
 * GET    /api/finance/vouchers/[id]  — 详情
 * PATCH  /api/finance/vouchers/[id]  — 老板审批：approve / reject / void
 * DELETE /api/finance/vouchers/[id]  — 总管理者物理删除（仅清理早期/无标记的测试残留；
 *                                       POSTED 不可删，必须先 VOID 留痕；不接 API Key）
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuthOrApiKey } from '@/lib/api-auth';
import { getSession } from '@/lib/auth';

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
  // edit：仅在 AI_DRAFT / BOSS_REVIEWING 状态下允许，POSTED/REJECTED/VOIDED 不可改
  z.object({
    action: z.literal('edit'),
    date: z.string().datetime().optional(),
    summary: z.string().min(1).max(500).optional(),
    debitAccount: z.string().min(1).max(100).optional(),
    creditAccount: z.string().min(1).max(100).optional(),
    amount: z.coerce.number().positive().optional(),
    currency: z.string().min(1).max(10).optional(),
    notes: z.string().max(1000).optional().nullable(),
    relatedTxIds: z.array(z.string()).optional().nullable(),
  }),
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

  if (data.action === 'edit') {
    // 只允许编辑未过账状态：POSTED 必须先 VOID 留痕；REJECTED/VOIDED 是终态
    if (voucher.status !== 'AI_DRAFT' && voucher.status !== 'BOSS_REVIEWING') {
      return NextResponse.json(
        {
          error: 'CANNOT_EDIT',
          from: voucher.status,
          hint: 'POSTED/REJECTED/VOIDED 凭证不能直接修改。POSTED 请先作废后重建，REJECTED/VOIDED 是终态。',
        },
        { status: 409 },
      );
    }
    const updateData: {
      date?: Date;
      summary?: string;
      debitAccount?: string;
      creditAccount?: string;
      amount?: number;
      currency?: string;
      notes?: string | null;
      relatedTxIds?: string | null;
    } = {};
    if (data.date !== undefined) updateData.date = new Date(data.date);
    if (data.summary !== undefined) updateData.summary = data.summary;
    if (data.debitAccount !== undefined) updateData.debitAccount = data.debitAccount;
    if (data.creditAccount !== undefined) updateData.creditAccount = data.creditAccount;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.notes !== undefined) updateData.notes = data.notes ?? null;
    if (data.relatedTxIds !== undefined) {
      updateData.relatedTxIds = data.relatedTxIds ? JSON.stringify(data.relatedTxIds) : null;
    }
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'NO_FIELDS', hint: '至少要改一个字段' },
        { status: 400 },
      );
    }
    const updated = await prisma.voucher.update({ where: { id }, data: updateData });
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

// ---- DELETE：仅 SUPER_ADMIN 物理删除 ----
//
// Why：自动清理 button 用正则匹配 summary/txHash 关键词，识别不到没标 TEST
// 的早期残留测试数据。给老板一个手动逐条删的入口，比扩匹配规则安全。
// 边界：
// - 仅 session 路径 + role === 'SUPER_ADMIN'，API Key 永远碰不到（含 FINANCE_ADMIN scope）
// - POSTED 凭证不可删 → 强制走 VOID 留痕（VOIDED 之后才能再删）
// - AiActivityLog 引用置 SET NULL（schema 已配），删 voucher 不阻塞历史日志
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 });
  }
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: 'SUPER_ADMIN_ONLY', hint: '仅总管理者可删凭证' },
      { status: 403 },
    );
  }

  const { id } = await params;
  const voucher = await prisma.voucher.findUnique({ where: { id } });
  if (!voucher) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  if (voucher.status === 'POSTED') {
    return NextResponse.json(
      {
        error: 'CANNOT_DELETE_POSTED',
        status: voucher.status,
        hint: '已过账（POSTED）凭证不可直接删除，请先作废（VOIDED）后再删，留下审计痕迹。',
      },
      { status: 409 },
    );
  }

  await prisma.voucher.delete({ where: { id } });
  return NextResponse.json({
    ok: true,
    deleted: { id, voucherNumber: voucher.voucherNumber, summary: voucher.summary, status: voucher.status },
  });
}
