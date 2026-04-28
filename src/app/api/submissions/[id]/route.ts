import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';

// PATCH a submission. Used in the revision loop: when a reviewer chose
// "REVISION_REQUESTED", the submitter updates their note (and optionally
// re-attaches files) and the row flips back to PENDING for re-review.
const schema = z.object({
  note: z.string().min(1).max(20000),
  attachmentIds: z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const data = schema.parse(await req.json());

  const submission = await prisma.submission.findUnique({
    where: { id: params.id },
    include: { task: true },
  });
  if (!submission) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (submission.userId !== user.id) {
    return NextResponse.json({ error: 'NOT_OWNER' }, { status: 403 });
  }
  // Only PENDING (untouched) and REVISION_REQUESTED (reviewer asked for fixes)
  // are editable. Once APPROVED/REJECTED the row is final unless an admin
  // calls DELETE on /review to undo first.
  if (submission.status !== 'PENDING' && submission.status !== 'REVISION_REQUESTED') {
    return NextResponse.json({ error: 'NOT_EDITABLE', status: submission.status }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.submission.update({
      where: { id: submission.id },
      data: {
        note: data.note,
        // Snap back to PENDING so reviewer's inbox surfaces it again. Old
        // reviewNote stays so the conversation history is preserved.
        status: 'PENDING',
      },
    });
    // Attachments — replace the set bound to this submission with the new
    // list. Orphan attachments not in the new list stay on disk but lose
    // their submissionId pointer.
    if (data.attachmentIds) {
      await tx.attachment.updateMany({
        where: { submissionId: submission.id },
        data: { submissionId: null },
      });
      if (data.attachmentIds.length > 0) {
        await tx.attachment.updateMany({
          where: {
            id: { in: data.attachmentIds },
            taskId: null,
            submissionId: null,
            announcementId: null,
            reportId: null,
            approvalInstanceId: null,
          },
          data: { submissionId: submission.id },
        });
      }
    }
    // Task: bring it back to SUBMITTED so the review queue picks it up.
    await tx.task.update({
      where: { id: submission.taskId },
      data: { status: 'SUBMITTED' },
    });
  });

  return NextResponse.json({ ok: true });
}
