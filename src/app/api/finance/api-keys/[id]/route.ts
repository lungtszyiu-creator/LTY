/**
 * 吊销 API Key —— 双轨权限：
 * - SUPER_ADMIN：吊销任何 key
 * - 系统 ADMIN：吊销任何部门 scope 的 key（视同所有部门 LEAD）
 * - 部门 LEAD：仅吊销本部门 scope 的 key
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

const SCOPE_PREFIX_TO_DEPT_SLUG: Record<string, string> = {
  ADMIN: 'admin',
  LTY_LEGAL: 'lty-legal',
  MC_LEGAL: 'mc-legal',
  HR: 'hr',
  CASHIER: 'cashier',
};

function scopeToDeptSlug(scope: string): string | null {
  for (const [prefix, slug] of Object.entries(SCOPE_PREFIX_TO_DEPT_SLUG)) {
    if (
      scope === `${prefix}_ADMIN` ||
      scope === `${prefix}_READONLY` ||
      scope.startsWith(`${prefix}_AI:`)
    ) {
      return slug;
    }
  }
  return null;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, active: true },
  });
  if (!dbUser?.active) return NextResponse.json({ error: 'INACTIVE' }, { status: 403 });

  const key = await prisma.apiKey.findUnique({
    where: { id: params.id },
    select: { id: true, scope: true },
  });
  if (!key) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (dbUser.role !== 'SUPER_ADMIN') {
    const targetSlug = scopeToDeptSlug(key.scope);
    if (!targetSlug) {
      return NextResponse.json(
        { error: 'CROSS_DEPT_SCOPE_FORBIDDEN', hint: 'FINANCE_* 等跨部门 scope 仅总管可吊销' },
        { status: 403 },
      );
    }
    if (dbUser.role !== 'ADMIN') {
      const dept = await prisma.department.findFirst({
        where: { slug: targetSlug, active: true },
        select: { id: true },
      });
      if (!dept) return NextResponse.json({ error: 'DEPT_NOT_FOUND' }, { status: 404 });
      const membership = await prisma.departmentMembership.findUnique({
        where: { departmentId_userId: { departmentId: dept.id, userId: dbUser.id } },
        select: { role: true },
      });
      if (!membership || membership.role !== 'LEAD') {
        return NextResponse.json({ error: 'NOT_DEPT_LEAD' }, { status: 403 });
      }
    }
  }

  const updated = await prisma.apiKey.update({
    where: { id: params.id },
    data: {
      active: false,
      revokedAt: new Date(),
      revokedById: dbUser.id,
    },
    select: { id: true, name: true, revokedAt: true, active: true },
  });
  return NextResponse.json(updated);
}
