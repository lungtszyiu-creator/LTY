import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';

// Patch awardedPoints on an already-APPROVED submission. Used to retro-fix
// historical entries reviewed before the partial-credit feature shipped
// (where awardedPoints was null and the leaderboard fell back to nominal
// task.points). Also syncs the linked RewardIssuance.points so the
// rewards page + leaderboard see the same number.
//
// Admin-only. Refuses to touch RewardIssuance rows already ISSUED /
// ACKNOWLEDGED — those are paid out and shouldn't change silently.
const schema = z.object({
  awardedPoints: z.number().finite().min(0).max(99999),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  const { awardedPoints } = schema.parse(await req.json());
  const rounded = Math.round(awardedPoints * 100) / 100;

  const submission = await prisma.submission.findUnique({
    where: { id: params.id },
    include: { task: { select: { id: true } } },
  });
  if (!submission) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (submission.status !== 'APPROVED') {
    return NextResponse.json({ error: 'NOT_APPROVED', status: submission.status }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.submission.update({
      where: { id: submission.id },
      data: { awardedPoints: rounded },
    });
    // Sync RewardIssuance only if it's still PENDING — ISSUED rows are
    // paid out, hands off.
    const reward = await tx.rewardIssuance.findUnique({
      where: { taskId_recipientId: { taskId: submission.taskId, recipientId: submission.userId } },
    });
    if (reward && reward.status === 'PENDING') {
      await tx.rewardIssuance.update({
        where: { id: reward.id },
        data: { points: rounded },
      });
    }
  });

  return NextResponse.json({ ok: true, awardedPoints: rounded });
}
