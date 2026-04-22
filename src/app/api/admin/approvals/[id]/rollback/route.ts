import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';
import { canManageLeaveBalance } from '@/lib/leaveBalanceAuth';
import { rollbackBalanceEffects } from '@/lib/approvalTerminal';
import { notifyApprovalFinalised } from '@/lib/email';

// Admin-only: reverse an already-APPROVED or REJECTED approval instance.
// Flips the instance to CANCELLED, writes compensating ledger entries so
// the employee's balance returns to the pre-approval state, and notifies
// the initiator. Intended for "oops approved the wrong thing" situations.
const schema = z.object({
  reason: z.string().max(500).optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  // Gate: SUPER_ADMIN or HR lead. Regular ADMINs can force-approve (already
  // built) but rolling back a decision + touching balances is a bigger
  // responsibility — keep it tight.
  const allowed = user.role === 'SUPER_ADMIN' || (await canManageLeaveBalance(user.id));
  if (!allowed) {
    return NextResponse.json(
      { error: 'FORBIDDEN_ROLLBACK', message: '只有总管理者或人事部负责人可以撤销已终结的审批并回滚余额' },
      { status: 403 }
    );
  }

  const data = schema.parse(await req.json().catch(() => ({})));

  const inst = await prisma.approvalInstance.findUnique({
    where: { id: params.id },
    include: {
      template: { select: { name: true } },
      initiator: { select: { email: true, name: true } },
    },
  });
  if (!inst) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // Only terminal non-cancelled states need rollback (IN_PROGRESS cancels
  // already go through the regular DELETE path and never touched balances).
  if (inst.status === 'IN_PROGRESS' || inst.status === 'CANCELLED') {
    return NextResponse.json(
      { error: 'NOT_ROLLBACKABLE', message: '该审批不处于"已通过/已驳回"状态，无需回滚' },
      { status: 409 }
    );
  }

  let rolledBack = 0;
  try {
    const r = await rollbackBalanceEffects(params.id, user.id, data.reason ?? null);
    rolledBack = r.rolledBack;
  } catch (e: any) {
    return NextResponse.json({ error: 'ROLLBACK_FAILED', message: e?.message ?? 'FAILED' }, { status: 500 });
  }

  await prisma.approvalInstance.update({
    where: { id: params.id },
    data: { status: 'CANCELLED', completedAt: new Date(), currentNodeId: null },
  });
  await prisma.approvalStep.create({
    data: {
      instanceId: params.id,
      nodeId: 'rollback',
      kind: 'APPROVAL',
      approverId: user.id,
      decision: 'REJECTED',
      note: data.reason ? `[管理员撤销回滚] ${data.reason}` : '[管理员撤销回滚]',
      decidedAt: new Date(),
    },
  });

  notifyApprovalFinalised({
    initiatorEmail: inst.initiator.email ?? '',
    initiatorName: inst.initiator.name ?? inst.initiator.email ?? '',
    instanceId: inst.id,
    instanceTitle: inst.title,
    templateName: inst.template.name,
    outcome: 'REJECTED',
    lastActorName: `${user.name ?? user.email ?? '管理员'}（后台撤销回滚）`,
    lastNote: data.reason ?? null,
  }).catch((e) => console.error('[approval] rollback notify failed', e));

  return NextResponse.json({ ok: true, rolledBack });
}
