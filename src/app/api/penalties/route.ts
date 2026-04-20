import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser, requireAdmin } from '@/lib/permissions';
import { notifyPenaltyIssued } from '@/lib/email';

// GET — members see their own; admins see everyone (or filtered).
export async function GET(req: NextRequest) {
  const user = await requireUser();
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  const userId = req.nextUrl.searchParams.get('userId');
  const status = req.nextUrl.searchParams.get('status');

  const where: any = {};
  if (status) where.status = status;
  if (!isAdmin) where.userId = user.id;
  else if (userId) where.userId = userId;

  const items = await prisma.penalty.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      issuedBy: { select: { id: true, name: true, email: true } },
      revokedBy: { select: { id: true, name: true, email: true } },
      task: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(items);
}

const createSchema = z.object({
  userId: z.string().min(1),
  taskId: z.string().optional().nullable(),
  reason: z.string().min(5).max(2000), // require at least a short reason
  points: z.number().int().min(1).max(9999),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const data = createSchema.parse(await req.json());

  // Self-penalty not allowed (integrity check, even though admin could try).
  if (data.userId === admin.id) {
    return NextResponse.json({ error: 'SELF_PENALTY_NOT_ALLOWED' }, { status: 403 });
  }

  const target = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { id: true, email: true, name: true },
  });
  if (!target) return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404 });

  let taskTitle: string | null = null;
  if (data.taskId) {
    const t = await prisma.task.findUnique({ where: { id: data.taskId }, select: { title: true } });
    taskTitle = t?.title ?? null;
  }

  const penalty = await prisma.penalty.create({
    data: {
      userId: data.userId,
      issuedById: admin.id,
      taskId: data.taskId ?? null,
      reason: data.reason,
      points: data.points,
      status: 'ACTIVE',
    },
  });

  notifyPenaltyIssued({
    recipientEmail: target.email ?? '',
    userName: target.name ?? target.email ?? '',
    issuerName: admin.name ?? admin.email ?? '管理员',
    points: penalty.points,
    reason: penalty.reason,
    taskId: penalty.taskId,
    taskTitle,
  }).catch((e) => console.error('[penalties] notify failed', e));

  return NextResponse.json(penalty, { status: 201 });
}
