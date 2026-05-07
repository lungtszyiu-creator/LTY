/**
 * 解锁被撞顶暂停的 AI 员工 — Step 5
 *
 * POST /api/employees/[id]/unpause
 *   仅 SUPER_ADMIN（老板）— 这是审批动作，普通 ADMIN 不放行
 *
 * 动作:
 *   1. set paused=false / pausedAt=null / pauseReason=null
 *   2. 写 AiActivityLog action="unpause_employee"
 *
 * 业务理由：员工撞顶自动 paused 后，老板要么 1) 直接解锁让 AI 继续跑，
 * 要么 2) 去 /employees 上调日额度再解锁。本端点只解锁不调额度，让两步
 * 显式分离 — 老板心里有数。
 *
 * 不发 TG 告警（解锁是老板的主动动作，没必要告知自己）。
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const admin = await requireSuperAdmin();
  const existing = await prisma.aiEmployee.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      paused: true,
      pausedAt: true,
      pauseReason: true,
      apiKeyId: true,
      dailyLimitHkd: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (!existing.paused) {
    return NextResponse.json(
      { error: 'NOT_PAUSED', hint: '该员工没在暂停状态' },
      { status: 422 },
    );
  }

  const previousReason = existing.pauseReason;
  const previousPausedAt = existing.pausedAt;

  await prisma.$transaction([
    prisma.aiEmployee.update({
      where: { id: existing.id },
      data: {
        paused: false,
        pausedAt: null,
        pauseReason: null,
      },
    }),
    prisma.aiActivityLog.create({
      data: {
        aiRole: 'system',
        action: 'unpause_employee',
        status: 'success',
        apiKeyId: existing.apiKeyId,
        payload: JSON.stringify({
          employeeId: existing.id,
          name: existing.name,
          previousReason,
          previousPausedAt: previousPausedAt?.toISOString() ?? null,
          dailyLimitHkd: Number(existing.dailyLimitHkd),
          unpausedBy: admin.id,
        }),
        dashboardWritten: true,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    employeeId: existing.id,
    name: existing.name,
  });
}
