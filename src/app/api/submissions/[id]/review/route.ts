import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';
import { notifySubmissionReviewed, notifyPenaltyIssued } from '@/lib/email';

const schema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().max(2000).optional(),
  // When rejecting, admin can atomically record a "failure penalty" (e.g.
  // claimed-then-never-delivered). Default deduction is 2× task points.
  recordAsFailure: z.boolean().optional(),
  penaltyPoints: z.number().int().min(0).max(9999).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  const { decision, note, recordAsFailure, penaltyPoints } = schema.parse(await req.json());

  const submission = await prisma.submission.findUnique({
    where: { id: params.id },
    include: { task: true, user: { select: { id: true, email: true, name: true } } },
  });
  if (!submission) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (submission.status !== 'PENDING')
    return NextResponse.json({ error: 'ALREADY_REVIEWED' }, { status: 409 });

  // Conflict of interest: the reviewer cannot approve / reject their own
  // submission. Task creator reviewing someone else's submission is fine.
  if (submission.userId === admin.id) {
    return NextResponse.json({ error: 'SELF_REVIEW_NOT_ALLOWED' }, { status: 403 });
  }

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

    if (submission.task.allowMultiClaim) {
      if (decision === 'APPROVED') {
        await tx.submission.updateMany({
          where: { taskId: submission.taskId, status: 'PENDING', id: { not: submission.id } },
          data: {
            status: 'REJECTED',
            reviewerId: admin.id,
            reviewNote: note ? `未被选为优胜方案。审核备注：${note}` : '未被选为优胜方案',
            reviewedAt: new Date(),
          },
        });
        await tx.task.update({
          where: { id: submission.taskId },
          data: {
            status: 'APPROVED',
            claimantId: submission.userId,
            claimedAt: submission.createdAt,
          },
        });
      } else {
        const remaining = await tx.submission.count({
          where: { taskId: submission.taskId, status: 'PENDING' },
        });
        await tx.task.update({
          where: { id: submission.taskId },
          data: { status: remaining > 0 ? 'SUBMITTED' : 'OPEN' },
        });
      }
    } else {
      const nextTaskStatus = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
      await tx.task.update({
        where: { id: submission.taskId },
        data: { status: nextTaskStatus },
      });
    }

    if (decision === 'APPROVED') {
      const existing = await tx.rewardIssuance.findUnique({
        where: { taskId_recipientId: { taskId: submission.taskId, recipientId: submission.userId } },
      });
      if (!existing) {
        const inferredMethod = submission.task.reward ? 'CASH' : 'POINTS_ONLY';
        await tx.rewardIssuance.create({
          data: {
            taskId: submission.taskId,
            recipientId: submission.userId,
            rewardText: submission.task.reward,
            points: submission.task.points,
            method: inferredMethod,
            status: 'PENDING',
          },
        });
      }
    }

    // Optional auto-penalty when REJECTED with "记录为失败浪费" checkbox.
    // Deducts 2× task.points by default but admin can override amount.
    let penaltyCreated: any = null;
    if (decision === 'REJECTED' && recordAsFailure) {
      const deduction = penaltyPoints ?? submission.task.points * 2;
      if (deduction > 0) {
        penaltyCreated = await tx.penalty.create({
          data: {
            userId: submission.userId,
            issuedById: admin.id,
            taskId: submission.taskId,
            points: deduction,
            reason: note
              ? `任务《${submission.task.title}》失败：${note}`
              : `任务《${submission.task.title}》领取后未能达成，记录为失败浪费`,
            status: 'ACTIVE',
          },
        });
      }
    }

    return { updatedSub, penaltyCreated };
  });

  // Send notifications out-of-transaction (retry logic is inside notify*).
  notifySubmissionReviewed({
    taskId: submission.taskId,
    taskTitle: submission.task.title,
    recipientEmail: submission.user.email ?? '',
    decision,
    reviewerName: admin.name ?? admin.email ?? '管理员',
    note: note ?? null,
  }).catch((e) => console.error('[review] notify submitter failed', e));

  if (result.penaltyCreated) {
    notifyPenaltyIssued({
      recipientEmail: submission.user.email ?? '',
      userName: submission.user.name ?? submission.user.email ?? '',
      issuerName: admin.name ?? admin.email ?? '管理员',
      points: result.penaltyCreated.points,
      reason: result.penaltyCreated.reason,
      taskId: submission.taskId,
      taskTitle: submission.task.title,
    }).catch((e) => console.error('[review] notify penalty failed', e));
  }

  return NextResponse.json(result.updatedSub);
}
