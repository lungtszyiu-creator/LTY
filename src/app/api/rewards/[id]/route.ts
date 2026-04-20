import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser, requireAdmin } from '@/lib/permissions';

const adminPatch = z.object({
  rewardText: z.string().max(200).nullable().optional(),
  points: z.number().int().min(0).max(99999).optional(),
  method: z.enum(['CASH', 'TRANSFER', 'VOUCHER', 'IN_KIND', 'POINTS_ONLY', 'OTHER']).optional(),
  status: z.enum(['PENDING', 'ISSUED', 'ACKNOWLEDGED', 'DISPUTED', 'CANCELLED']).optional(),
  note: z.string().max(2000).nullable().optional(),
  receiptAttachmentIds: z.array(z.string()).optional(),
});

// Member self-actions (limited to acknowledge / dispute on their own record)
const memberPatch = z.object({
  status: z.enum(['ACKNOWLEDGED', 'DISPUTED']),
  note: z.string().max(2000).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

  const existing = await prisma.rewardIssuance.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const raw = await req.json();

  if (isAdmin) {
    const data = adminPatch.parse(raw);
    const patch: any = { ...data };
    delete patch.receiptAttachmentIds;
    // When admin flips to ISSUED, stamp the actor and time (unless re-issued).
    if (data.status === 'ISSUED' && existing.status !== 'ISSUED') {
      patch.issuedAt = new Date();
      patch.issuedById = user.id;
    }
    // Reverting from ISSUED/ACKNOWLEDGED back to PENDING clears stamps so the
    // record doesn't carry stale "paid on Xxx" info.
    if (data.status === 'PENDING' || data.status === 'CANCELLED') {
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
      return r;
    });
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
