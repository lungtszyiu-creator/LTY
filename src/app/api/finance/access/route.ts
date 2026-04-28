/**
 * 财务访问授权 API（仅 SUPER_ADMIN）
 *
 * GET  /api/finance/access  → 列出所有有 financeRole 的人
 * POST /api/finance/access  → 设置某人的 financeRole（VIEWER / EDITOR / null）
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/permissions';

export async function GET() {
  await requireSuperAdmin();

  // 列出所有有 financeRole 的人 + 老板（SUPER_ADMIN 自动有权）
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { role: 'SUPER_ADMIN' },
        { financeRole: { not: null } },
      ],
      active: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      financeRole: true,
    },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });

  return NextResponse.json({ users });
}

const setSchema = z.object({
  userId: z.string().min(1),
  financeRole: z.enum(['VIEWER', 'EDITOR']).nullable(),
});

export async function POST(req: NextRequest) {
  const admin = await requireSuperAdmin();
  const data = setSchema.parse(await req.json());

  // 不允许给 SUPER_ADMIN 显式设 financeRole（自动有权，避免冲突）
  const target = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { id: true, role: true, name: true },
  });
  if (!target) {
    return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404 });
  }
  if (target.role === 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: 'SUPER_ADMIN_AUTO_GRANTED', message: 'SUPER_ADMIN 已自动有 EDITOR 权限，无需设值' },
      { status: 400 },
    );
  }

  const updated = await prisma.user.update({
    where: { id: data.userId },
    data: { financeRole: data.financeRole },
    select: { id: true, name: true, email: true, financeRole: true },
  });

  return NextResponse.json(updated);
}
