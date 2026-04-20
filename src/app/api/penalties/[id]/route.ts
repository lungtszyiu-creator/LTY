import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';

const schema = z.object({
  status: z.enum(['ACTIVE', 'REVOKED']),
  revokeReason: z.string().max(2000).optional().nullable(),
});

// Revoke or re-activate a penalty. Revocation requires a reason. We keep the
// record (never delete) so the audit trail — "penalty issued on X, revoked
// on Y by Z because ..." — survives for year-end reviews.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  const data = schema.parse(await req.json());
  const existing = await prisma.penalty.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (data.status === 'REVOKED' && !(data.revokeReason && data.revokeReason.trim())) {
    return NextResponse.json({ error: 'REVOKE_REASON_REQUIRED' }, { status: 400 });
  }

  const updated = await prisma.penalty.update({
    where: { id: params.id },
    data: {
      status: data.status,
      revokedAt: data.status === 'REVOKED' ? new Date() : null,
      revokedById: data.status === 'REVOKED' ? admin.id : null,
      revokeReason: data.status === 'REVOKED' ? data.revokeReason : null,
    },
  });
  return NextResponse.json(updated);
}
