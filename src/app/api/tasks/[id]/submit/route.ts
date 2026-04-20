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

  if (task.allowMultiClaim) {
    // Multi-claim: must have an unreleased TaskClaim. Task status OPEN or SUBMITTED.
    if (task.status === 'APPROVED' || task.status === 'ARCHIVED') {
      return NextResponse.json({ error: 'NOT_SUBMITTABLE' }, { status: 409 });
    }
    const claim = await prisma.taskClaim.findUnique({
      where: { taskId_userId: { taskId: task.id, userId: user.id } },
    });
    if (!claim || claim.releasedAt) {
      return NextResponse.json({ error: 'NOT_CLAIMANT' }, { status: 403 });
    }
  } else {
    if (task.claimantId !== user.id)
      return NextResponse.json({ error: 'NOT_CLAIMANT' }, { status: 403 });
    if (!['CLAIMED', 'REJECTED'].includes(task.status))
      return NextResponse.json({ error: 'NOT_SUBMITTABLE' }, { status: 409 });
  }

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
    // Flip task to SUBMITTED (for both modes — in multi-claim it signals "admin
    // has something to review" but more submissions can still arrive).
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
