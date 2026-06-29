import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser, requireAdmin } from '@/lib/permissions';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await requireUser();
  const task = await prisma.task.findUnique({
    where: { id: params.id },
    include: {
      creator: { select: { id: true, name: true, email: true, image: true } },
      claimant: { select: { id: true, name: true, email: true, image: true } },
      attachments: true,
      submissions: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
          reviewer: { select: { id: true, name: true, email: true } },
          attachments: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!task) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json(task);
}

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).optional(),
  reward: z.string().max(100).nullable().optional(),
  deadline: z.string().datetime().nullable().optional(),
  points: z.number().finite().min(0).max(99999).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  contribution: z.enum(['CROSS_TEAM', 'PROCESS', 'KNOWLEDGE', 'FIREFIGHT', 'EXTERNAL', 'GROWTH', 'OTHER']).optional(),
  status: z.enum(['OPEN', 'CLAIMED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ARCHIVED']).optional(),
  allowMultiClaim: z.boolean().optional(),
});

/**
 * 2026-06-29: PATCH + DELETE 加 TaskAuditLog 完整审计
 * 任何 ADMIN 改/删 task 都留痕:who/when/IP/UA/前后快照
 * 不抛错: audit log 写失败不阻断业务(降级 console.error)
 */
function getClientMeta(req: NextRequest) {
  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    req.ip ||
    null;
  const userAgent = req.headers.get('user-agent') || null;
  return { ipAddress, userAgent };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const actor = await requireAdmin();
  const body = await req.json();
  const data = patchSchema.parse(body);

  // 改前快照
  const before = await prisma.task.findUnique({ where: { id: params.id } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const task = await prisma.task.update({
    where: { id: params.id },
    data: {
      ...data,
      deadline:
        data.deadline === undefined ? undefined : data.deadline ? new Date(data.deadline) : null,
    },
  });

  // 改后 audit log (异步,不阻断)
  const { ipAddress, userAgent } = getClientMeta(req);
  prisma.taskAuditLog
    .create({
      data: {
        taskId: params.id,
        action: 'UPDATE',
        actorId: actor.id,
        actorEmail: actor.email ?? '',
        actorRole: actor.role ?? '',
        actorName: actor.name ?? null,
        ipAddress,
        userAgent,
        beforeSnapshot: before as any,
        afterSnapshot: task as any,
      },
    })
    .catch((e) => console.error('[TaskAuditLog UPDATE failed]', e));

  return NextResponse.json(task);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const actor = await requireAdmin();

  // 删前完整快照(关联 submissions/attachments/claims/reward 一并存)
  const before = await prisma.task.findUnique({
    where: { id: params.id },
    include: {
      submissions: true,
      attachments: true,
      claims: true,
      rewards: true,
      penalties: true,
    },
  });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  await prisma.task.delete({ where: { id: params.id } });

  // audit log (异步, 不阻断响应)
  const { ipAddress, userAgent } = getClientMeta(req);
  prisma.taskAuditLog
    .create({
      data: {
        taskId: params.id,
        action: 'DELETE',
        actorId: actor.id,
        actorEmail: actor.email ?? '',
        actorRole: actor.role ?? '',
        actorName: actor.name ?? null,
        ipAddress,
        userAgent,
        beforeSnapshot: before as any,
        // afterSnapshot omitted (DELETE 无 after,默认 NULL)
      },
    })
    .catch((e) => console.error('[TaskAuditLog DELETE failed]', e));

  return NextResponse.json({ ok: true });
}
