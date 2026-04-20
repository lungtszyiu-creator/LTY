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

    // Auto-create a PENDING RewardIssuance when approving so the payout is
    // always on an admin's to-do list — never "approved and forgotten". The
    // (taskId, recipientId) unique key makes this idempotent if the admin
    // re-approves or clicks twice. Non-fatal if already exists.
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

    return updatedSub;
  });

  return NextResponse.json(result);
}
