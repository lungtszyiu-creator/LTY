import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';
import { notifyRewardStatusChanged } from '@/lib/email';

const adminPatch = z.object({
  rewardText: z.string().max(200).nullable().optional(),
  points: z.number().finite().min(0).max(99999).optional(),
  method: z.enum(['CASH', 'TRANSFER', 'VOUCHER', 'IN_KIND', 'POINTS_ONLY', 'OTHER']).optional(),
  status: z.enum(['PENDING', 'ISSUED', 'ACKNOWLEDGED', 'DISPUTED', 'CANCELLED']).optional(),
  note: z.string().max(2000).nullable().optional(),
  rejectReason: z.string().max(2000).nullable().optional(),
  receiptAttachmentIds: z.array(z.string()).optional(),
});

const memberPatch = z.object({
  status: z.enum(['ACKNOWLEDGED', 'DISPUTED']),
  note: z.string().max(2000).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

  const existing = await prisma.rewardIssuance.findUnique({
    where: { id: params.id },
    include: { task: { select: { title: true } }, recipient: { select: { id: true, email: true, name: true } } },
  });
  if (!existing) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const raw = await req.json();

  if (isAdmin) {
    const data = adminPatch.parse(raw);

    // Conflict of interest: an admin who is ALSO the recipient cannot mark
    // their own reward as issued. Super-admin cannot bypass — the only way
    // around it is to have another admin pay them. A separate carve-out is
    // made when the admin is only EDITING metadata (no status flip to ISSUED).
    if (existing.recipientId === user.id && data.status === 'ISSUED') {
      return NextResponse.json({ error: 'SELF_ISSUE_NOT_ALLOWED' }, { status: 403 });
    }

    // Rejection (CANCELLED) requires an explicit reason — the whole point of
    // the rewrite is to leave a trail instead of silently deleting.
    if (data.status === 'CANCELLED' && !(data.rejectReason && data.rejectReason.trim())) {
      return NextResponse.json({ error: 'REJECT_REASON_REQUIRED' }, { status: 400 });
    }

    const patch: any = { ...data };
    delete patch.receiptAttachmentIds;

    if (data.status === 'ISSUED' && existing.status !== 'ISSUED') {
      patch.issuedAt = new Date();
      patch.issuedById = user.id;
      patch.rejectReason = null;
    }
    if (data.status === 'PENDING') {
      patch.issuedAt = null;
      patch.issuedById = null;
      patch.acknowledgedAt = null;
      patch.rejectReason = null;
    }
    if (data.status === 'CANCELLED') {
      patch.issuedAt = null;
      patch.issuedById = null;
      patch.acknowledgedAt = null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.rewardIssuance.update({ where: { id: params.id }, data: patch });
      if (data.receiptAttachmentIds?.length) {
        await tx.attachment.updateMany({
          where: {
            id: { in: data.receiptAttachmentIds },
            taskId: null,
            submissionId: null,
            rewardId: null,
          },
          data: { rewardId: r.id },
        });
      }
      // Mirror the points edit back onto the Submission so 战功榜
      // (which reads Submission.awardedPoints) reflects the new number.
      if (typeof data.points === 'number' && data.points !== existing.points) {
        await tx.submission.updateMany({
          where: {
            taskId: existing.taskId,
            userId: existing.recipientId,
            status: 'APPROVED',
          },
          data: { awardedPoints: Math.round(data.points * 100) / 100 },
        });
      }
      return r;
    });

    // Notify recipient on material status changes.
    if (data.status && data.status !== existing.status &&
        (data.status === 'ISSUED' || data.status === 'CANCELLED' || data.status === 'DISPUTED')) {
      notifyRewardStatusChanged({
        taskId: existing.taskId,
        taskTitle: existing.task.title,
        recipientEmail: existing.recipient.email ?? '',
        status: data.status,
        rewardText: data.rewardText ?? existing.rewardText,
        points: data.points ?? existing.points,
        actorName: user.name ?? user.email ?? '管理员',
        reason: data.rejectReason ?? data.note ?? null,
      }).catch((e) => console.error('[rewards] notify status change failed', e));
    }

    return NextResponse.json(updated);
  }

  // Member path — must be the recipient.
  if (existing.recipientId !== user.id) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const data = memberPatch.parse(raw);
  if (data.status === 'ACKNOWLEDGED' && existing.status !== 'ISSUED') {
    return NextResponse.json({ error: 'NOT_ISSUED_YET' }, { status: 409 });
  }
  const updated = await prisma.rewardIssuance.update({
    where: { id: params.id },
    data: {
      status: data.status,
      note: data.note ?? existing.note,
      acknowledgedAt: data.status === 'ACKNOWLEDGED' ? new Date() : existing.acknowledgedAt,
    },
  });
  return NextResponse.json(updated);
}
