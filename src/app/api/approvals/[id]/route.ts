import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  const inst = await prisma.approvalInstance.findUnique({
    where: { id: params.id },
    include: {
      template: { select: { id: true, name: true, icon: true, category: true } },
      initiator: { select: { id: true, name: true, email: true, image: true } },
      attachments: true,
      steps: {
        include: { approver: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!inst) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const involvesMe =
    inst.initiatorId === user.id ||
    inst.steps.some((s) => s.approverId === user.id);
  if (!isAdmin && !involvesMe) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  return NextResponse.json(inst);
}

// DELETE behaviour:
// - Default: soft-cancel (status=CANCELLED). Allowed for initiator while
//   status=IN_PROGRESS, or any admin.
// - ?hard=1: permanent delete with cascade. SUPER_ADMIN only, regardless of
//   instance status. Use case: wipe accidental duplicates, old training data.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const hard = new URL(req.url).searchParams.get('hard') === '1';
  const inst = await prisma.approvalInstance.findUnique({ where: { id: params.id } });
  if (!inst) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (hard) {
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'SUPER_ADMIN_ONLY' }, { status: 403 });
    }
    await prisma.approvalInstance.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true, hard: true });
  }

  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  const isInitiator = inst.initiatorId === user.id;
  if (!isAdmin && !isInitiator) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  if (inst.status !== 'IN_PROGRESS') {
    return NextResponse.json({ error: 'ALREADY_FINALISED' }, { status: 409 });
  }

  await prisma.approvalInstance.update({
    where: { id: params.id },
    data: { status: 'CANCELLED', completedAt: new Date(), currentNodeId: null },
  });
  await prisma.approvalStep.updateMany({
    where: { instanceId: params.id, decision: null },
    data: { superseded: true },
  });
  return NextResponse.json({ ok: true });
}
