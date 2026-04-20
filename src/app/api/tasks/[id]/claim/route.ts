import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser, hasMinRole, type Role } from '@/lib/permissions';
import { MAX_CONCURRENT_CLAIMS } from '@/lib/constants';

// Count active commitments across BOTH modes: single-claim tasks (claimantId)
// and multi-claim tasks (unreleased TaskClaim where task not finalised).
async function activeCommitmentCount(userId: string) {
  const [single, multi] = await Promise.all([
    prisma.task.count({
      where: { claimantId: userId, status: { in: ['CLAIMED', 'SUBMITTED'] } },
    }),
    prisma.taskClaim.count({
      where: {
        userId,
        releasedAt: null,
        task: { status: { notIn: ['APPROVED', 'ARCHIVED'] } },
      },
    }),
  ]);
  return single + multi;
}

// POST = claim, DELETE = release (by claimant or admin)
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (!task) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // Anti-hoarding cap applies to both modes.
  const inProgress = await activeCommitmentCount(user.id);
  if (inProgress >= MAX_CONCURRENT_CLAIMS) {
    return NextResponse.json(
      { error: 'TOO_MANY_CLAIMS', limit: MAX_CONCURRENT_CLAIMS },
      { status: 429 }
    );
  }

  if (task.allowMultiClaim) {
    // Multi-claim: task status stays OPEN even after others claim. Each user
    // gets one TaskClaim row. Already-claimed is a no-op (idempotent).
    if (task.status !== 'OPEN' && task.status !== 'SUBMITTED') {
      return NextResponse.json({ error: 'NOT_CLAIMABLE' }, { status: 409 });
    }
    const existing = await prisma.taskClaim.findUnique({
      where: { taskId_userId: { taskId: task.id, userId: user.id } },
    });
    if (existing && !existing.releasedAt) {
      return NextResponse.json({ ok: true, alreadyClaimed: true, taskId: task.id });
    }
    if (existing && existing.releasedAt) {
      await prisma.taskClaim.update({
        where: { id: existing.id },
        data: { releasedAt: null, claimedAt: new Date() },
      });
    } else {
      await prisma.taskClaim.create({ data: { taskId: task.id, userId: user.id } });
    }
    return NextResponse.json({ ok: true, multiClaim: true, taskId: task.id });
  }

  // Single-claim: first come first served.
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

  const isAdmin = hasMinRole(user.role as Role, 'ADMIN');

  if (task.allowMultiClaim) {
    // Multi-claim: release own TaskClaim (or admin force-release specific user
    // via query param `userId=...`).
    const targetUserId = isAdmin && _req.nextUrl.searchParams.get('userId')
      ? _req.nextUrl.searchParams.get('userId')!
      : user.id;
    const claim = await prisma.taskClaim.findUnique({
      where: { taskId_userId: { taskId: task.id, userId: targetUserId } },
    });
    if (!claim || claim.releasedAt) {
      return NextResponse.json({ error: 'NOT_CLAIMED' }, { status: 409 });
    }
    await prisma.taskClaim.update({
      where: { id: claim.id },
      data: { releasedAt: new Date() },
    });
    return NextResponse.json({ ok: true, multiClaim: true });
  }

  // Single-claim release
  const isOwner = task.claimantId === user.id;
  if (!isOwner && !isAdmin)
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  if (task.status !== 'CLAIMED')
    return NextResponse.json({ error: 'NOT_RELEASABLE' }, { status: 409 });

  const updated = await prisma.task.update({
    where: { id: params.id },
    data: { claimantId: null, claimedAt: null, status: 'OPEN' },
  });
  return NextResponse.json(updated);
}
