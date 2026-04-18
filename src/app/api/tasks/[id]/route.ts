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
  points: z.number().int().min(0).max(999).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  status: z.enum(['OPEN', 'CLAIMED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ARCHIVED']).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin();
  const body = await req.json();
  const data = patchSchema.parse(body);
  const task = await prisma.task.update({
    where: { id: params.id },
    data: {
      ...data,
      deadline:
        data.deadline === undefined ? undefined : data.deadline ? new Date(data.deadline) : null,
    },
  });
  return NextResponse.json(task);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin();
  await prisma.task.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
