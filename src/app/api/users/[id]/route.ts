import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';
import { hasMinRole, type Role } from '@/lib/auth';
import { setLeaveBalance } from '@/lib/leaveBalance';

const schema = z.object({
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MEMBER']).optional(),
  active: z.boolean().optional(),
  name: z.string().max(100).nullable().optional(),
  // Absolute set (admin enters the target value, e.g. "13.5" 天). Ledger
  // entry records the delta + actor so audit is preserved.
  annualLeaveBalance: z.number().finite().optional(),
  compLeaveBalance:   z.number().finite().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  const data = schema.parse(await req.json());

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const iAmSuper = hasMinRole(admin.role as Role, 'SUPER_ADMIN');

  // Only SUPER_ADMIN may promote/demote admins, touch another admin's record,
  // or assign the SUPER_ADMIN tier. Regular ADMINs can only manage MEMBERs.
  if (data.role === 'SUPER_ADMIN' && !iAmSuper) {
    return NextResponse.json({ error: 'FORBIDDEN_SUPER_ADMIN_ONLY' }, { status: 403 });
  }
  if (!iAmSuper && (target.role === 'SUPER_ADMIN' || target.role === 'ADMIN')) {
    return NextResponse.json({ error: 'FORBIDDEN_CANNOT_EDIT_ADMIN' }, { status: 403 });
  }
  if (!iAmSuper && data.role === 'ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN_CANNOT_PROMOTE_ADMIN' }, { status: 403 });
  }

  // Don't let an admin lock themselves out: block self-demote / self-deactivate
  // if they'd remove the last SUPER_ADMIN or the last ADMIN+.
  if (params.id === admin.id && (data.role === 'MEMBER' || data.active === false)) {
    const [superCount, adminCount] = await Promise.all([
      prisma.user.count({ where: { role: 'SUPER_ADMIN', active: true } }),
      prisma.user.count({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] }, active: true } }),
    ]);
    if (admin.role === 'SUPER_ADMIN' && superCount <= 1)
      return NextResponse.json({ error: 'LAST_SUPER_ADMIN' }, { status: 409 });
    if (adminCount <= 1)
      return NextResponse.json({ error: 'LAST_ADMIN' }, { status: 409 });
  }

  // Split balance updates out — they go through setLeaveBalance so the ledger
  // gets a row; everything else is a plain column update.
  const { annualLeaveBalance, compLeaveBalance, ...rest } = data;

  let user = await prisma.user.update({ where: { id: params.id }, data: rest });

  if (typeof annualLeaveBalance === 'number') {
    await setLeaveBalance({
      userId: params.id, pool: 'ANNUAL',
      newValue: annualLeaveBalance, actorId: admin.id,
      note: '管理员在用户列表直接设置',
    });
  }
  if (typeof compLeaveBalance === 'number') {
    await setLeaveBalance({
      userId: params.id, pool: 'COMP',
      newValue: compLeaveBalance, actorId: admin.id,
      note: '管理员在用户列表直接设置',
    });
  }

  if (typeof annualLeaveBalance === 'number' || typeof compLeaveBalance === 'number') {
    user = await prisma.user.findUnique({ where: { id: params.id } }) ?? user;
  }
  return NextResponse.json(user);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (params.id === admin.id)
    return NextResponse.json({ error: 'SELF_DELETE' }, { status: 409 });

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const iAmSuper = hasMinRole(admin.role as Role, 'SUPER_ADMIN');
  if (!iAmSuper && (target.role === 'SUPER_ADMIN' || target.role === 'ADMIN')) {
    return NextResponse.json({ error: 'FORBIDDEN_CANNOT_DELETE_ADMIN' }, { status: 403 });
  }
  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
