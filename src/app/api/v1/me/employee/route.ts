/**
 * 给 X-Api-Key 持有人查"我是哪个 AI 员工" — 探活 / 探员工状态用
 *
 * GET /api/v1/me/employee
 *   header: X-Api-Key: lty_xxx
 *   返回:
 *     { employee: { id, name, role, deptSlug, paused, dailyLimitHkd, dailyUsedHkd } }
 *   或 401/403/404
 *
 * 用途：
 *   - finance_bridge LLM proxy 启动时探活、检查 ApiKey 还有效
 *   - AI 工作流启动时拿 employeeId（避免硬编 id）
 *   - debug：老板用 curl 测一把 key 还活着没
 *
 * 不需要 body，纯 GET，幂等。
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashApiKey } from '@/lib/api-auth';
import { startOfTodayHk, endOfTodayHk, employeeSpendByRange } from '@/lib/budget';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const headerKey = req.headers.get('x-api-key');
  if (!headerKey) {
    return NextResponse.json({ error: 'API_KEY_MISSING' }, { status: 401 });
  }
  const apiKey = await prisma.apiKey.findUnique({
    where: { hashedKey: hashApiKey(headerKey) },
    select: {
      id: true,
      active: true,
      revokedAt: true,
      expiresAt: true,
      keyPrefix: true,
      scope: true,
      aiEmployee: {
        select: {
          id: true,
          name: true,
          role: true,
          deptSlug: true,
          active: true,
          paused: true,
          pauseReason: true,
          dailyLimitHkd: true,
          lastActiveAt: true,
        },
      },
    },
  });
  if (!apiKey || !apiKey.active || apiKey.revokedAt) {
    return NextResponse.json({ error: 'API_KEY_INVALID_OR_REVOKED' }, { status: 401 });
  }
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return NextResponse.json({ error: 'API_KEY_EXPIRED' }, { status: 401 });
  }
  if (!apiKey.aiEmployee) {
    return NextResponse.json(
      {
        error: 'API_KEY_NOT_LINKED_TO_EMPLOYEE',
        hint: '本 ApiKey 没挂在任何 AI 员工档案上。去 /employees 关联，或老板用一键导入。',
        keyPrefix: apiKey.keyPrefix,
        scope: apiKey.scope,
      },
      { status: 404 },
    );
  }

  // 顺手返今日已花，让 bridge / 调试者能立刻看预算余量
  const dailyUsedHkd = await employeeSpendByRange(
    apiKey.aiEmployee.id,
    startOfTodayHk(),
    endOfTodayHk(),
  );

  return NextResponse.json({
    employee: {
      id: apiKey.aiEmployee.id,
      name: apiKey.aiEmployee.name,
      role: apiKey.aiEmployee.role,
      deptSlug: apiKey.aiEmployee.deptSlug,
      active: apiKey.aiEmployee.active,
      paused: apiKey.aiEmployee.paused,
      pauseReason: apiKey.aiEmployee.pauseReason,
      dailyLimitHkd: Number(apiKey.aiEmployee.dailyLimitHkd),
      dailyUsedHkd: Number(dailyUsedHkd.toFixed(6)),
      lastActiveAt: apiKey.aiEmployee.lastActiveAt?.toISOString() ?? null,
    },
    apiKey: {
      keyPrefix: apiKey.keyPrefix,
      scope: apiKey.scope,
    },
  });
}
