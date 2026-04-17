import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';

const schema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  const { decision, note } = schema.parse(await req.json());

  const submission = await prisma.submission.findUnique({
    where: { id: params.id },
    include: { task: true },
  });
  if (!submission) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (submission.status !== 'PENDING')
    return NextResponse.json({ error: 'ALREADY_REVIEWED' }, { status: 409 });

  const result = await prisma.$transaction(async (tx) => {
    const updatedSub = await tx.submission.update({
      where: { id: submission.id },
      data: {
        status: decision,
        reviewerId: admin.id,
        reviewNote: note ?? null,
        reviewedAt: new Date(),
      },
    });
    const nextTaskStatus = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    await tx.task.update({
      where: { id: submission.taskId },
      data: { status: nextTaskStatus },
    });
    return updatedSub;
  });

  return NextResponse.json(result);
}
