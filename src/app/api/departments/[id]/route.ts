import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/).optional(),
  description: z.string().max(1000).nullable().optional(),
  leadUserId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  order: z.number().int().optional(),
  active: z.boolean().optional(),
  // Full set of member ids to sync — any existing memberships not in this
  // list are removed, anything new is added. Optional: if omitted we leave
  // memberships alone.
  memberIds: z.array(z.string()).optional(),
  // Per-member role override. Any id listed here becomes ADMIN of the
  // department (= lets them approve reimbursements etc. through the
  // INITIATOR_DEPT_LEAD / role-escalation pipeline). Members not in this
  // array default to role=MEMBER.
  memberAdminIds: z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin();
  const data = patchSchema.parse(await req.json());

  const { memberIds, memberAdminIds, ...rest } = data;

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.department.update({ where: { id: params.id }, data: rest });
    if (memberIds) {
      // Sync memberships: remove stale, add missing.
      const existing = await tx.departmentMembership.findMany({
        where: { departmentId: params.id },
        select: { id: true, userId: true, role: true },
      });
      const existingIds = new Set(existing.map((m) => m.userId));
      const targetIds = new Set(memberIds);
      const adminSet = new Set(memberAdminIds ?? []);
      const toRemove = existing.filter((m) => !targetIds.has(m.userId)).map((m) => m.id);
      const toAdd = memberIds.filter((u) => !existingIds.has(u));
      if (toRemove.length) {
        await tx.departmentMembership.deleteMany({ where: { id: { in: toRemove } } });
      }
      if (toAdd.length) {
        await tx.departmentMembership.createMany({
          data: toAdd.map((userId) => ({
            departmentId: params.id,
            userId,
            role: adminSet.has(userId) ? 'ADMIN' : 'MEMBER',
          })),
          skipDuplicates: true,
        });
      }
      // Flip role on existing rows so admin state matches the submitted list.
      if (memberAdminIds) {
        await tx.departmentMembership.updateMany({
          where: { departmentId: params.id, userId: { in: memberIds.filter((u) => adminSet.has(u)) } },
          data: { role: 'ADMIN' },
        });
        await tx.departmentMembership.updateMany({
          where: {
            departmentId: params.id,
            userId: { in: memberIds.filter((u) => !adminSet.has(u)) },
            role: 'ADMIN',
          },
          data: { role: 'MEMBER' },
        });
      }
    }
    return updated;
  });

  return NextResponse.json(result);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin();
  await prisma.department.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
