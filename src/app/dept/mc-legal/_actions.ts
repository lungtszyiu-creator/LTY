'use server';

/**
 * MC 法务部 server actions —— 操作 McLegalRequest 表（MC Markets 外包业务）
 *
 * 跟 lty-legal/_actions.ts 镜像但操作 McLegalRequest（物理隔离铁律：
 * MC 数据绝不与 LTY 自家共表）。删除收紧到 SUPER_ADMIN。
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

export async function createMcLegalRequest(formData: FormData) {
  const ctx = await requireDeptEdit('mc-legal');
  const parsed = requestSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    throw new Error(`输入校验失败：${parsed.error.issues[0]?.message ?? 'invalid'}`);
  }
  const d = parsed.data;
  await prisma.mcLegalRequest.create({
    data: {
      title: d.title,
      description: d.description?.toString().trim() || null,
      category: d.category || null,
      priority: d.priority,
      status: 'OPEN',
      requesterId: ctx.userId,
      assigneeId: d.assigneeId?.toString().trim() || null,
      notes: d.notes?.toString().trim() || null,
    },
  });
  revalidatePath('/dept/mc-legal');
  redirect('/dept/mc-legal');
}

export async function updateMcLegalRequest(id: string, formData: FormData) {
  await requireDeptEdit('mc-legal');
  const parsed = requestSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    throw new Error(`输入校验失败：${parsed.error.issues[0]?.message ?? 'invalid'}`);
  }
  const d = parsed.data;
  const resolved = d.status === 'RESOLVED' || d.status === 'CANCELLED';
  await prisma.mcLegalRequest.update({
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
  revalidatePath('/dept/mc-legal');
  revalidatePath(`/dept/mc-legal/requests/${id}`);
  redirect(`/dept/mc-legal/requests/${id}`);
}

export async function deleteMcLegalRequest(id: string) {
  const ctx = await requireDeptEdit('mc-legal');
  if (!ctx.isSuperAdmin) {
    throw new Error('仅总管可永久删除需求');
  }
  await prisma.mcLegalRequest.delete({ where: { id } });
  revalidatePath('/dept/mc-legal');
  redirect('/dept/mc-legal');
}
