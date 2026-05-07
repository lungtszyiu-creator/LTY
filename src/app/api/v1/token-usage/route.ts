/**
 * AI Token 用量上报端点 — Step 2
 *
 * POST /api/v1/token-usage
 *   入参: { employeeId, model, inputTokens, outputTokens, meta? }
 *   鉴权: X-Api-Key（员工独立 key，AiEmployee.apiKeyId 反查到员工）
 *
 * 流程：
 *   1. 校验 X-Api-Key → 拿 ApiKey 行 → 反查 AiEmployee
 *   2. 校验 employee 存在 / active / !paused
 *   3. 校验请求里的 employeeId === apiKey 关联的员工 id（防越权）
 *   4. 服务端 computeCostHkd() — 不信前端传的金额（铁律）
 *   5. 写 TokenUsage 行
 *   6. 顺手 update AiEmployee.lastActiveAt = now() — 看板算 在跑/待命/离线
 *
 * Step 2 暂不含「撞顶 paused=true + TG 告警」（那是 Step 5）。
 *
 * 返回:
 *   { ok: true, costHkd: 0.043, dailyUsedHkd: 12.5, paused: false }
 *
 * 注意：本路由不走 LTY 现有 requireApiKey()（那个是 scope-based 校验给
 * 部门数据接口用），而是按 X-Api-Key → ApiKey → AiEmployee 反查的模式，
 * 让任何 ApiKey 持有人都能上报自己的用量（前提是 ApiKey 已挂在某 AiEmployee 上）。
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { hashApiKey } from '@/lib/api-auth';
import { computeCostHkd } from '@/lib/pricing';
import { startOfTodayHk, endOfTodayHk, employeeSpendByRange } from '@/lib/budget';

export const dynamic = 'force-dynamic';

const writeSchema = z.object({
  employeeId: z.string().min(1),
  model: z.string().min(1).max(100),
  inputTokens: z.number().int().min(0).max(10_000_000),
  outputTokens: z.number().int().min(0).max(10_000_000),
  meta: z.record(z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  // 1. X-Api-Key 鉴权
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
      aiEmployee: {
        select: {
          id: true,
          name: true,
          active: true,
          paused: true,
          dailyLimitHkd: true,
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
        hint: '本 ApiKey 没挂在任何 AI 员工档案上。先去 /employees 创建员工并绑定 key，或编辑现有员工挂上。',
      },
      { status: 403 },
    );
  }

  // 2. body 校验
  let data;
  try {
    data = writeSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: 'INVALID_BODY', detail: e instanceof Error ? e.message : 'parse failed' },
      { status: 400 },
    );
  }

  // 3. 防越权：请求里的 employeeId 必须是 apiKey 关联的员工
  const employee = apiKey.aiEmployee;
  if (data.employeeId !== employee.id) {
    return NextResponse.json(
      {
        error: 'EMPLOYEE_ID_MISMATCH',
        hint: '请求里 employeeId 必须等于本 ApiKey 关联的员工 id',
      },
      { status: 403 },
    );
  }

  // 4. 校验员工状态
  if (!employee.active) {
    return NextResponse.json({ error: 'EMPLOYEE_INACTIVE' }, { status: 403 });
  }
  if (employee.paused) {
    // Step 5 加：撞顶后 paused=true 时返 429 + 引导解锁审批入口
    return NextResponse.json(
      {
        error: 'BUDGET_EXCEEDED',
        paused: true,
        hint: '该员工已被暂停（撞顶或人工停用），联系老板解锁',
      },
      { status: 429 },
    );
  }

  // 5. 服务端算成本（不信前端）
  const costHkd = computeCostHkd(data.model, data.inputTokens, data.outputTokens);

  // 6. 写入 + 顺手更新 lastActiveAt
  await prisma.$transaction([
    prisma.tokenUsage.create({
      data: {
        employeeId: employee.id,
        model: data.model,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        costHkd,
        meta: (data.meta as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    }),
    prisma.aiEmployee.update({
      where: { id: employee.id },
      data: { lastActiveAt: new Date() },
    }),
    prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    }),
  ]);

  // 7. 算今日已花（含本次）+ 返回 — Step 5 起这里加撞顶判断
  const dailyUsedHkd = await employeeSpendByRange(
    employee.id,
    startOfTodayHk(),
    endOfTodayHk(),
  );

  return NextResponse.json({
    ok: true,
    costHkd: Number(costHkd.toFixed(6)),
    dailyUsedHkd: Number(dailyUsedHkd.toFixed(6)),
    dailyLimitHkd: Number(employee.dailyLimitHkd),
    paused: false,
  });
}
