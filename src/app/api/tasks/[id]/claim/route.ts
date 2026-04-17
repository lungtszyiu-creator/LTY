import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';

// POST = claim, DELETE = release (by claimant or admin)
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (!task) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (task.status !== 'OPEN')
    return NextResponse.json({ error: 'NOT_CLAIMABLE' }, { status: 409 });

  const updated = await prisma.task.update({
    where: { id: params.id, status: 'OPEN' },
    data: { claimantId: user.id, claimedAt: new Date(), status: 'CLAIMED' },
  }).catch(() => null);

  if (!updated) return NextResponse.json({ error: 'RACE' }, { status: 409 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (!task) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  const isOwner = task.claimantId === user.id;
  if (!isOwner && user.role !== 'ADMIN')
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  if (task.status !== 'CLAIMED')
    return NextResponse.json({ error: 'NOT_RELEASABLE' }, { status: 409 });

  const updated = await prisma.task.update({
    where: { id: params.id },
    data: { claimantId: null, claimedAt: null, status: 'OPEN' },
  });
  return NextResponse.json(updated);
}
