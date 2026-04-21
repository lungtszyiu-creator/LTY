import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';
import { adminForceDecide } from '@/lib/approvalRuntime';
import { applyBalanceEffects } from '@/lib/approvalTerminal';
import { notifyApprovalFinalised } from '@/lib/email';

// Admin backend: force-decide an in-progress approval from the management
// console. Bypasses the usual "NOT_YOUR_STEP" guard but records the action
// as an explicit override in the step log.
const schema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().max(2000).optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  const data = schema.parse(await req.json());
  try {
    const result = await adminForceDecide(params.id, data.decision, admin.id, data.note ?? null);

    const inst = await prisma.approvalInstance.findUnique({
      where: { id: params.id },
      include: {
        template: { select: { name: true } },
        initiator: { select: { email: true, name: true } },
      },
    });

    if (result.status === 'APPROVED') {
      await applyBalanceEffects(params.id).catch((e) => console.error('[approval] balance effects failed', e));
    }

    if (inst && (result.status === 'APPROVED' || result.status === 'REJECTED')) {
      notifyApprovalFinalised({
        initiatorEmail: inst.initiator.email ?? '',
        initiatorName: inst.initiator.name ?? inst.initiator.email ?? '',
        instanceId: inst.id,
        instanceTitle: inst.title,
        templateName: inst.template.name,
        outcome: result.status,
        lastActorName: `${admin.name ?? admin.email ?? '管理员'}（后台操作）`,
        lastNote: data.note ?? null,
      }).catch((e) => console.error('[approval] admin force notify failed', e));
    }

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'FAILED' }, { status: 400 });
  }
}
