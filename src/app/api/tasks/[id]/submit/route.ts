import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';
import { notifySubmission } from '@/lib/email';

const bodySchema = z.object({
  note: z.string().min(1).max(5000),
  attachmentIds: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (!task) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (task.claimantId !== user.id)
    return NextResponse.json({ error: 'NOT_CLAIMANT' }, { status: 403 });

  if (!['CLAIMED', 'REJECTED'].includes(task.status))
    return NextResponse.json({ error: 'NOT_SUBMITTABLE' }, { status: 409 });

  const { note, attachmentIds } = bodySchema.parse(await req.json());

  const submission = await prisma.$transaction(async (tx) => {
    const sub = await tx.submission.create({
      data: { taskId: task.id, userId: user.id, note, status: 'PENDING' },
    });
    if (attachmentIds?.length) {
      await tx.attachment.updateMany({
        where: { id: { in: attachmentIds }, taskId: null, submissionId: null },
        data: { submissionId: sub.id },
      });
    }
    await tx.task.update({ where: { id: task.id }, data: { status: 'SUBMITTED' } });
    return sub;
  });

  await notifySubmission({
    taskId: task.id,
    taskTitle: task.title,
    submitterName: user.name ?? '',
    submitterEmail: user.email ?? '',
    note,
  });

  return NextResponse.json(submission, { status: 201 });
}
