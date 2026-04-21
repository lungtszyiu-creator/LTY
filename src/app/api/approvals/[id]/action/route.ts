import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';
import { applyDecision } from '@/lib/approvalRuntime';
import { applyBalanceEffects } from '@/lib/approvalTerminal';
import { notifyApprovalPending, notifyApprovalFinalised } from '@/lib/email';

const schema = z.object({
  stepId: z.string().min(1),
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().max(2000).optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const data = schema.parse(await req.json());
  try {
    const result = await applyDecision(params.id, data.stepId, data.decision, user.id, data.note ?? null);

    const inst = await prisma.approvalInstance.findUnique({
      where: { id: params.id },
      include: {
        template: { select: { name: true } },
        initiator: { select: { email: true, name: true } },
      },
    });

    if (inst) {
      // Notify next approvers on advance.
      if (result.newStepIds.length > 0) {
        const steps = await prisma.approvalStep.findMany({
          where: { id: { in: result.newStepIds } },
          include: { approver: { select: { email: true, name: true } } },
        });
        for (const s of steps) {
          if (!s.approver?.email) continue;
          notifyApprovalPending({
            approverEmail: s.approver.email,
            approverName: s.approver.name ?? s.approver.email,
            instanceId: inst.id,
            instanceTitle: inst.title,
            templateName: inst.template.name,
            initiatorName: inst.initiator.name ?? inst.initiator.email ?? '',
          }).catch((e) => console.error('[approval] notify next pending failed', e));
        }
      }

      // Leave/overtime balance effects fire on APPROVED. Idempotent via the
      // LeaveBalanceLedger unique constraint so admin force-approval after
      // a normal approval won't double-apply.
      if (result.status === 'APPROVED') {
        await applyBalanceEffects(params.id).catch((e) => console.error('[approval] balance effects failed', e));
      }

      // Notify initiator on terminal.
      if (result.status === 'APPROVED' || result.status === 'REJECTED') {
        notifyApprovalFinalised({
          initiatorEmail: inst.initiator.email ?? '',
          initiatorName: inst.initiator.name ?? inst.initiator.email ?? '',
          instanceId: inst.id,
          instanceTitle: inst.title,
          templateName: inst.template.name,
          outcome: result.status,
          lastActorName: user.name ?? user.email ?? '',
          lastNote: data.note ?? null,
        }).catch((e) => console.error('[approval] notify finalised failed', e));
      }
    }

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'FAILED' }, { status: 400 });
  }
}
