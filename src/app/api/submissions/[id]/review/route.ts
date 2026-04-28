import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';
import { notifySubmissionReviewed, notifyPenaltyIssued } from '@/lib/email';

// Three-way decision so reviewers can ask for revisions instead of being
// stuck with binary approve/reject. REVISION_REQUESTED keeps the work in
// the user's court — they edit + re-submit and the row flips back to
// PENDING. APPROVED can also carry a partial-credit amount in
// `awardedPoints` (decimal) so "你做了一半" gets rewarded correctly.
const schema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED', 'REVISION_REQUESTED']),
  note: z.string().max(2000).optional(),
  awardedPoints: z.number().finite().min(0).max(99999).optional(),
  recordAsFailure: z.boolean().optional(),
  penaltyPoints: z.number().min(0).max(99999).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  const { decision, note, awardedPoints, recordAsFailure, penaltyPoints } = schema.parse(await req.json());

  const submission = await prisma.submission.findUnique({
    where: { id: params.id },
    include: { task: true, user: { select: { id: true, email: true, name: true } } },
  });
  if (!submission) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (submission.status !== 'PENDING')
    return NextResponse.json({ error: 'ALREADY_REVIEWED' }, { status: 409 });

  if (submission.userId === admin.id) {
    return NextResponse.json({ error: 'SELF_REVIEW_NOT_ALLOWED' }, { status: 403 });
  }

  // Compute the actual award. Default to the task's nominal points so
  // reviewers who don't touch the input get the old behaviour.
  const finalPoints = decision === 'APPROVED'
    ? round2(awardedPoints != null ? awardedPoints : submission.task.points)
    : null;

  const result = await prisma.$transaction(async (tx) => {
    const updatedSub = await tx.submission.update({
      where: { id: submission.id },
      data: {
        status: decision,
        awardedPoints: finalPoints,
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
      } else if (decision === 'REJECTED') {
        const remaining = await tx.submission.count({
          where: { taskId: submission.taskId, status: 'PENDING' },
        });
        await tx.task.update({
          where: { id: submission.taskId },
          data: { status: remaining > 0 ? 'SUBMITTED' : 'OPEN' },
        });
      } else {
        // REVISION_REQUESTED — task stays SUBMITTED so reviewer keeps
        // visibility on the inbox until the user resubmits.
        await tx.task.update({
          where: { id: submission.taskId },
          data: { status: 'SUBMITTED' },
        });
      }
    } else {
      const nextTaskStatus =
        decision === 'APPROVED'           ? 'APPROVED'
        : decision === 'REJECTED'         ? 'REJECTED'
        : /* REVISION_REQUESTED */          'CLAIMED';
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
            // Mirror the actual awarded amount, not the nominal task.points.
            points: finalPoints ?? 0,
            method: inferredMethod,
            status: 'PENDING',
          },
        });
      } else {
        // If a RewardIssuance already existed (e.g. earlier undo left a
        // dangling pre-filled record), sync its points to the new award.
        await tx.rewardIssuance.update({
          where: { id: existing.id },
          data: { points: finalPoints ?? existing.points },
        });
      }
    }

    let penaltyCreated: any = null;
    if (decision === 'REJECTED' && recordAsFailure) {
      // Penalty.points is integer; round in case task.points is decimal.
      const rawDeduction = penaltyPoints ?? submission.task.points * 2;
      const deduction = Math.round(rawDeduction);
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

  notifySubmissionReviewed({
    taskId: submission.taskId,
    taskTitle: submission.task.title,
    recipientEmail: submission.user.email ?? '',
    decision: decision === 'REVISION_REQUESTED' ? 'REJECTED' : decision,
    reviewerName: admin.name ?? admin.email ?? '管理员',
    note: decision === 'REVISION_REQUESTED'
      ? `${note ?? ''}\n\n（审核结果：要求修改后再次提交）`
      : (note ?? null),
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

// Undo a review. Resets submission to PENDING + cleans up auto-created
// reward / penalty when they're still in their initial state. Task goes
// back to SUBMITTED so it shows up in the review queue again.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  const submission = await prisma.submission.findUnique({
    where: { id: params.id },
    include: { task: true },
  });
  if (!submission) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (submission.status === 'PENDING') {
    return NextResponse.json({ error: 'NOT_REVIEWED' }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.submission.update({
      where: { id: submission.id },
      data: {
        status: 'PENDING',
        awardedPoints: null,
        reviewerId: null,
        reviewNote: null,
        reviewedAt: null,
      },
    });
    // Roll back the RewardIssuance only if nothing's been paid yet — once
    // it's ISSUED/ACKNOWLEDGED the books are written, admin must undo
    // manually so audit isn't silently rewritten.
    const reward = await tx.rewardIssuance.findUnique({
      where: { taskId_recipientId: { taskId: submission.taskId, recipientId: submission.userId } },
    });
    if (reward && reward.status === 'PENDING') {
      await tx.rewardIssuance.delete({ where: { id: reward.id } });
    }
    // Same for penalty — only auto-revoke ACTIVE penalties tied to this task.
    await tx.penalty.updateMany({
      where: { taskId: submission.taskId, userId: submission.userId, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date(), revokedById: admin.id },
    });
    await tx.task.update({
      where: { id: submission.taskId },
      data: { status: 'SUBMITTED', claimantId: submission.userId },
    });
  });

  return NextResponse.json({ ok: true });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
