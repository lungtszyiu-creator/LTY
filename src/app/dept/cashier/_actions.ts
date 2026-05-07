'use server';

/**
 * 出纳部 server actions —— Reimbursement / ReconciliationTask / ComplianceEntry
 *
 * 权限：requireDeptEdit('cashier')。永久删除收紧到 SUPER_ADMIN。
 *
 * ⭐ ComplianceEntry.dualLayer：默认 REAL；老板手工切到 COMPLIANCE。
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireDeptEdit } from '@/lib/dept-access';

function parseDate(v: FormDataEntryValue | null): Date | null {
  if (!v || typeof v !== 'string' || !v.trim()) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ===== Reimbursement =====
const reimbSchema = z.object({
  category: z.enum(['TRAVEL', 'MEAL', 'OFFICE', 'TRAINING', 'OTHER']),
  title: z.string().min(1).max(200),
  amount: z.coerce.number().positive(),
  currency: z.enum(['HKD', 'CNY', 'USD']),
  department: z.string().max(100).optional().nullable(),
  reason: z.string().max(2000).optional().nullable(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED']),
  notes: z.string().max(2000).optional().nullable(),
});

export async function createReimbursement(formData: FormData) {
  const ctx = await requireDeptEdit('cashier');
  const parsed = reimbSchema.safeParse({
    category: formData.get('category') || 'TRAVEL',
    title: formData.get('title'),
    amount: formData.get('amount'),
    currency: formData.get('currency') || 'CNY',
    department: formData.get('department') || null,
    reason: formData.get('reason') || null,
    status: formData.get('status') || 'PENDING',
    notes: formData.get('notes') || null,
  });
  if (!parsed.success) {
    throw new Error(`输入校验失败：${parsed.error.issues[0]?.message ?? 'invalid'}`);
  }
  const d = parsed.data;
  await prisma.cashierReimbursement.create({
    data: {
      applicantId: ctx.userId,
      category: d.category,
      title: d.title,
      amount: d.amount.toString(),
      currency: d.currency,
      occurredOn: parseDate(formData.get('occurredOn')),
      department: d.department?.trim() || null,
      reason: d.reason?.trim() || null,
      status: d.status,
      notes: d.notes?.trim() || null,
    },
  });
  revalidatePath('/dept/cashier');
  redirect('/dept/cashier?tab=expense');
}

export async function approveReimbursement(id: string) {
  const ctx = await requireDeptEdit('cashier');
  await prisma.cashierReimbursement.update({
    where: { id },
    data: {
      status: 'APPROVED',
      approvedById: ctx.userId,
      approvedAt: new Date(),
      rejectReason: null,
    },
  });
  revalidatePath('/dept/cashier');
  revalidatePath(`/dept/cashier/reimbursements/${id}`);
  redirect(`/dept/cashier/reimbursements/${id}`);
}

export async function rejectReimbursement(id: string, formData: FormData) {
  const ctx = await requireDeptEdit('cashier');
  const reason = (formData.get('rejectReason') as string | null)?.trim() || '未填原因';
  await prisma.cashierReimbursement.update({
    where: { id },
    data: {
      status: 'REJECTED',
      approvedById: ctx.userId,
      approvedAt: new Date(),
      rejectReason: reason,
    },
  });
  revalidatePath('/dept/cashier');
  revalidatePath(`/dept/cashier/reimbursements/${id}`);
  redirect(`/dept/cashier/reimbursements/${id}`);
}

export async function markReimbPaid(id: string) {
  await requireDeptEdit('cashier');
  await prisma.cashierReimbursement.update({
    where: { id },
    data: { status: 'PAID', paidAt: new Date() },
  });
  revalidatePath('/dept/cashier');
  revalidatePath(`/dept/cashier/reimbursements/${id}`);
  redirect(`/dept/cashier/reimbursements/${id}`);
}

export async function deleteReimbursement(id: string) {
  const ctx = await requireDeptEdit('cashier');
  if (!ctx.isSuperAdmin) throw new Error('仅总管可永久删除报销');
  await prisma.cashierReimbursement.delete({ where: { id } });
  revalidatePath('/dept/cashier');
  redirect('/dept/cashier?tab=expense');
}

// ===== Reconciliation Task =====
const reconSchema = z.object({
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

export async function createReconTask(formData: FormData) {
  await requireDeptEdit('cashier');
  const parsed = reconSchema.safeParse({
    title: formData.get('title'),
    reconType: formData.get('reconType') || 'OTHER',
    cycle: formData.get('cycle') || 'MONTHLY',
    ownerRole: formData.get('ownerRole') || null,
    description: formData.get('description') || null,
    dueAt: formData.get('dueAt'),
    notes: formData.get('notes') || null,
  });
  if (!parsed.success) throw new Error(`输入校验失败：${parsed.error.issues[0]?.message ?? 'invalid'}`);
  const d = parsed.data;
  const dueDate = parseDate(d.dueAt);
  if (!dueDate) throw new Error('截止日期无效');
  await prisma.cashierReconciliationTask.create({
    data: {
      title: d.title,
      reconType: d.reconType,
      cycle: d.cycle,
      ownerRole: d.ownerRole?.trim() || null,
      description: d.description?.trim() || null,
      dueAt: dueDate,
      notes: d.notes?.trim() || null,
    },
  });
  revalidatePath('/dept/cashier');
  redirect('/dept/cashier?tab=reconciliation');
}

export async function markReconDone(id: string) {
  await requireDeptEdit('cashier');
  await prisma.cashierReconciliationTask.update({
    where: { id },
    data: { status: 'DONE', completedAt: new Date() },
  });
  revalidatePath('/dept/cashier');
}

// ===== Compliance Entry =====
const complianceSchema = z.object({
  category: z.enum(['TAX', 'LICENSE', 'BANK_ACCOUNT', 'EXCHANGE_ACCOUNT', 'FIXED_ASSET']),
  name: z.string().min(1).max(200),
  identifier: z.string().max(200).optional().nullable(),
  cycle: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL', 'ADHOC']).optional().nullable(),
  responsibleName: z.string().max(100).optional().nullable(),
  dualLayer: z.enum(['REAL', 'COMPLIANCE', 'BOTH']),
  status: z.enum(['ACTIVE', 'EXPIRING', 'EXPIRED', 'ARCHIVED']),
  notes: z.string().max(2000).optional().nullable(),
});

export async function createComplianceEntry(formData: FormData) {
  await requireDeptEdit('cashier');
  const parsed = complianceSchema.safeParse({
    category: formData.get('category') || 'TAX',
    name: formData.get('name'),
    identifier: formData.get('identifier') || null,
    cycle: formData.get('cycle') || null,
    responsibleName: formData.get('responsibleName') || null,
    dualLayer: formData.get('dualLayer') || 'REAL',
    status: formData.get('status') || 'ACTIVE',
    notes: formData.get('notes') || null,
  });
  if (!parsed.success) throw new Error(`输入校验失败：${parsed.error.issues[0]?.message ?? 'invalid'}`);
  const d = parsed.data;
  await prisma.cashierComplianceEntry.create({
    data: {
      category: d.category,
      name: d.name,
      identifier: d.identifier?.trim() || null,
      cycle: d.cycle || null,
      nextDueAt: parseDate(formData.get('nextDueAt')),
      responsibleName: d.responsibleName?.trim() || null,
      dualLayer: d.dualLayer,
      status: d.status,
      notes: d.notes?.trim() || null,
    },
  });
  revalidatePath('/dept/cashier');
  redirect(`/dept/cashier?tab=compliance&sub=${d.category}`);
}

export async function deleteComplianceEntry(id: string) {
  const ctx = await requireDeptEdit('cashier');
  if (!ctx.isSuperAdmin) throw new Error('仅总管可永久删除合规记录');
  const e = await prisma.cashierComplianceEntry.findUnique({ where: { id }, select: { category: true } });
  await prisma.cashierComplianceEntry.delete({ where: { id } });
  revalidatePath('/dept/cashier');
  redirect(`/dept/cashier?tab=compliance${e ? `&sub=${e.category}` : ''}`);
}
