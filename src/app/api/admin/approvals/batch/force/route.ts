import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';
import { adminForceDecide } from '@/lib/approvalRuntime';
import { notifyApprovalFinalised } from '@/lib/email';

// Batch backend override — let the admin clear a backlog of in-progress
// approvals in one click. Each id runs through the same single-instance
// path so audit trails stay consistent; failures (already-finalised,
// not-found) are collected and reported per-id rather than rolling the
// whole batch back.
const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().max(2000).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const data = schema.parse(await req.json());

  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const id of data.ids) {
    try {
      await adminForceDecide(id, data.decision, admin.id, data.note ?? null);
      results.push({ id, ok: true });

      // Fire-and-forget per-instance notification. Keeps the response fast
      // even if some emails lag; failures are logged but don't break the
      // batch result.
      prisma.approvalInstance.findUnique({
        where: { id },
        include: {
          template: { select: { name: true } },
          initiator: { select: { email: true, name: true } },
        },
      }).then((inst) => {
        if (!inst) return;
        return notifyApprovalFinalised({
          initiatorEmail: inst.initiator.email ?? '',
          initiatorName: inst.initiator.name ?? inst.initiator.email ?? '',
          instanceId: inst.id,
          instanceTitle: inst.title,
          templateName: inst.template.name,
          outcome: data.decision,
          lastActorName: `${admin.name ?? admin.email ?? '管理员'}（后台批量操作）`,
          lastNote: data.note ?? null,
        });
      }).catch((e) => console.error('[approval] batch notify failed', id, e));
    } catch (e: any) {
      results.push({ id, ok: false, error: e?.message ?? 'FAILED' });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  return NextResponse.json({ okCount, failCount, results });
}
