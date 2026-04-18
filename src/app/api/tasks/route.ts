import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser, requireAdmin } from '@/lib/permissions';
import { notifyTaskPublished } from '@/lib/email';

export async function GET(req: NextRequest) {
  await requireUser();
  const status = req.nextUrl.searchParams.get('status');
  const mine = req.nextUrl.searchParams.get('mine');
  const session = await requireUser();

  const where: any = {};
  if (status) where.status = status;
  if (mine === 'claimed') where.claimantId = session.id;
  if (mine === 'created') where.creatorId = session.id;

  const tasks = await prisma.task.findMany({
    where,
    include: {
      creator: { select: { id: true, name: true, email: true, image: true } },
      claimant: { select: { id: true, name: true, email: true, image: true } },
      _count: { select: { submissions: true, attachments: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(tasks);
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  reward: z.string().max(100).optional().nullable(),
  deadline: z.string().datetime().optional().nullable(),
  points: z.number().int().min(0).max(999).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  attachmentIds: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json();
  const data = createSchema.parse(body);

  const task = await prisma.task.create({
    data: {
      title: data.title,
      description: data.description,
      reward: data.reward ?? null,
      deadline: data.deadline ? new Date(data.deadline) : null,
      points: data.points ?? 10,
      priority: data.priority ?? 'NORMAL',
      creatorId: admin.id,
      status: 'OPEN',
    },
  });

  if (data.attachmentIds?.length) {
    await prisma.attachment.updateMany({
      where: { id: { in: data.attachmentIds }, taskId: null, submissionId: null },
      data: { taskId: task.id },
    });
  }

  await notifyTaskPublished(task);

  return NextResponse.json(task, { status: 201 });
}
