'use server';

/**
 * LTY 法务部 server actions —— 操作 LtyLegalRequest 表（自家业务）
 *
 * 跟 mc-legal/_actions.ts 镜像但操作不同 prisma model（物理隔离）。
 * 删除收紧到 SUPER_ADMIN。
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireDeptEdit } from '@/lib/dept-access';

const requestSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional().nullable(),
  category: z
    .enum(['CONTRACT_REVIEW', 'IP', 'COMPLIANCE', 'DISPUTE', 'OTHER'])
    .optional()
    .nullable(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED']).default('OPEN'),
  assigneeId: z.string().optional().nullable(),
  resolutionNote: z.string().max(2000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

function parseForm(formData: FormData) {
  return {
    title: formData.get('title'),
    description: formData.get('description') || null,
    category: formData.get('category') || null,
    priority: formData.get('priority') || 'NORMAL',
    status: formData.get('status') || 'OPEN',
    assigneeId: formData.get('assigneeId') || null,
    resolutionNote: formData.get('resolutionNote') || null,
    notes: formData.get('notes') || null,
  };
}

export async function createLtyLegalRequest(formData: FormData) {
  const ctx = await requireDeptEdit('lty-legal');
  const parsed = requestSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    throw new Error(`输入校验失败：${parsed.error.issues[0]?.message ?? 'invalid'}`);
  }
  const d = parsed.data;
  await prisma.ltyLegalRequest.create({
    data: {
      title: d.title,
      description: d.description?.toString().trim() || null,
      category: d.category || null,
      priority: d.priority,
      status: 'OPEN', // 新建强制 OPEN，不接受 form 里的 status
      requesterId: ctx.userId,
      assigneeId: d.assigneeId?.toString().trim() || null,
      notes: d.notes?.toString().trim() || null,
    },
  });
  revalidatePath('/dept/lty-legal');
  redirect('/dept/lty-legal');
}

export async function updateLtyLegalRequest(id: string, formData: FormData) {
  await requireDeptEdit('lty-legal');
  const parsed = requestSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    throw new Error(`输入校验失败：${parsed.error.issues[0]?.message ?? 'invalid'}`);
  }
  const d = parsed.data;
  const resolved = d.status === 'RESOLVED' || d.status === 'CANCELLED';
  await prisma.ltyLegalRequest.update({
    where: { id },
    data: {
      title: d.title,
      description: d.description?.toString().trim() || null,
      category: d.category || null,
      priority: d.priority,
      status: d.status,
      assigneeId: d.assigneeId?.toString().trim() || null,
      resolutionNote: d.resolutionNote?.toString().trim() || null,
      resolvedAt: resolved ? new Date() : null,
      notes: d.notes?.toString().trim() || null,
    },
  });
  revalidatePath('/dept/lty-legal');
  revalidatePath(`/dept/lty-legal/requests/${id}`);
  redirect(`/dept/lty-legal/requests/${id}`);
}

export async function deleteLtyLegalRequest(id: string) {
  const ctx = await requireDeptEdit('lty-legal');
  if (!ctx.isSuperAdmin) {
    throw new Error('仅总管可永久删除需求');
  }
  await prisma.ltyLegalRequest.delete({ where: { id } });
  revalidatePath('/dept/lty-legal');
  redirect('/dept/lty-legal');
}
