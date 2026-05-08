/**
 * AI Token 用量上报端点
 *
 * POST /api/v1/token-usage
 *   入参: { employeeId?, model, inputTokens?, outputTokens?, inputChars?, outputChars?, meta? }
 *   鉴权: X-Api-Key（员工独立 key，AiEmployee.apiKeyId 反查到员工）
 *
 *   token 数 / 字符数二选一即可（也可同时传，token 优先）：
 *     - inputTokens + outputTokens：精确（bridge LLM proxy 抓 usage 拿到的）
 *     - inputChars + outputChars：估算（Coze 大模型节点不返 usage，传 prompt
 *       + response 字符数，看板用 ÷3 估 token，误差 ±10-15%，撞顶判断够用）
 *
 * 流程：
 *   1. 校验 X-Api-Key → 拿 ApiKey 行 → 反查 AiEmployee
 *   2. 校验 employee 存在 / active / !paused
 *   3. 校验请求里的 employeeId === apiKey 关联的员工 id（防越权）
 *   4. 服务端 computeCostHkd() — 不信前端传的金额（铁律）
 *   5. 写 TokenUsage 行 + update lastActiveAt
 *   6. Step 5 撞顶处理：
 *      - 员工日花费 > dailyLimitHkd → 自动 paused=true + AiActivityLog +
 *        TG 告警老板（异步 fire-and-forget 不阻塞主流程）
 *      - 公司日花费 > 公司日预算 → 当日首次跨阈值时告警 + log；不冻结
 *        任何员工（一个 AI 跑飞冻全员风险大，老板手动评估再下调单条额度）
 *
 * 返回:
 *   { ok: true, costHkd: 0.043, dailyUsedHkd: 12.5, paused: false|true }
 *   员工已 paused → 返 429 BUDGET_EXCEEDED
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
import { computeCostHkd, getCompanyDailyBudgetHkd } from '@/lib/pricing';
import { startOfTodayHk, endOfTodayHk, employeeSpendByRange, spendByRange } from '@/lib/budget';
import { sendBossNotice, escapeTgHtml } from '@/lib/notify';

export const dynamic = 'force-dynamic';

// 三种上报模式（只要 model + 二选一的 token/chars）：
//
//   ① 精确：直接传 inputTokens + outputTokens（bridge LLM proxy / 自家
//      脚本调 LLM 拿到 usage 字段，最准）
//   ② 估算：传 inputChars + outputChars（Coze 大模型节点不返 usage，
//      把 prompt + response 的字符数传上来，看板用 ÷3 估 token，
//      中英混合误差 ±10-15%，撞顶判断够用）
//   ③ 混合：可同时传，token 优先；缺哪边 fallback 到 chars 估
//
// employeeId 可选：bridge / Coze 不知道 id，只知道 X-Api-Key — 看板自己反查。
const writeSchema = z
  .object({
    employeeId: z.string().min(1).optional(),
    model: z.string().min(1).max(100),
    inputTokens: z.number().int().min(0).max(10_000_000).optional(),
    outputTokens: z.number().int().min(0).max(10_000_000).optional(),
    inputChars: z.number().int().min(0).max(50_000_000).optional(),
    outputChars: z.number().int().min(0).max(50_000_000).optional(),
    meta: z.record(z.unknown()).optional(),
  })
  .refine(
    (d) =>
      d.inputTokens !== undefined ||
      d.outputTokens !== undefined ||
      d.inputChars !== undefined ||
      d.outputChars !== undefined,
    { message: '必须传 inputTokens/outputTokens 或 inputChars/outputChars 之一' },
  );

/** 字符数 → token 估算（中英混合 ~3 char/token；纯英文 ~4，纯中文 ~2，取中间值 3） */
function charsToTokens(chars: number): number {
  return Math.ceil(chars / 3);
}

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

  // 3. 防越权：如果 body 里传了 employeeId，必须 === apiKey 关联的员工
  //    （没传时直接用 ApiKey 反查的，bridge LLM proxy 走这条路径）
  const employee = apiKey.aiEmployee;
  if (data.employeeId && data.employeeId !== employee.id) {
    return NextResponse.json(
      {
        error: 'EMPLOYEE_ID_MISMATCH',
        hint: '请求里 employeeId 必须等于本 ApiKey 关联的员工 id（或省略让看板自动反查）',
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
  // 优先用精确 token 数；缺则用 chars/3 估
  const inputTokens =
    data.inputTokens !== undefined
      ? data.inputTokens
      : data.inputChars !== undefined
      ? charsToTokens(data.inputChars)
      : 0;
  const outputTokens =
    data.outputTokens !== undefined
      ? data.outputTokens
      : data.outputChars !== undefined
      ? charsToTokens(data.outputChars)
      : 0;
  const costHkd = computeCostHkd(data.model, inputTokens, outputTokens);

  // 估算上报时把原始 chars 也存到 meta，方便后续审计 / 校准
  const metaWithEstimate: Record<string, unknown> = { ...(data.meta ?? {}) };
  if (data.inputTokens === undefined && data.inputChars !== undefined) {
    metaWithEstimate.estimated = true;
    metaWithEstimate.inputChars = data.inputChars;
    metaWithEstimate.outputChars = data.outputChars;
  }

  // 6. 写入 + 顺手更新 lastActiveAt
  await prisma.$transaction([
    prisma.tokenUsage.create({
      data: {
        employeeId: employee.id,
        model: data.model,
        inputTokens,
        outputTokens,
        costHkd,
        meta:
          Object.keys(metaWithEstimate).length > 0
            ? (metaWithEstimate as Prisma.InputJsonValue)
            : Prisma.JsonNull,
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

  // 7. 算今日已花（含本次）
  const todayStart = startOfTodayHk();
  const todayEnd = endOfTodayHk();
  const dailyUsedHkd = await employeeSpendByRange(employee.id, todayStart, todayEnd);
  const dailyLimit = Number(employee.dailyLimitHkd);

  // 8. 员工撞顶 → 自动 paused + AiActivityLog + TG 告警（异步不阻塞）
  let nowPaused = false;
  if (dailyUsedHkd > dailyLimit) {
    nowPaused = true;
    const reason = `撞顶 HKD ${dailyUsedHkd.toFixed(2)} > 日额度 ${dailyLimit.toFixed(2)}`;
    await prisma.aiEmployee.update({
      where: { id: employee.id },
      data: {
        paused: true,
        pausedAt: new Date(),
        pauseReason: reason,
      },
    });
    await prisma.aiActivityLog.create({
      data: {
        aiRole: 'ai_employee',
        action: 'budget_exceeded_auto_pause',
        status: 'success',
        apiKeyId: apiKey.id,
        payload: JSON.stringify({
          employeeId: employee.id,
          name: employee.name,
          dailyUsedHkd,
          dailyLimitHkd: dailyLimit,
          model: data.model,
        }),
        telegramSent: false, // 下面发完会有 record，但本表不再 update（一行 log 就够）
        dashboardWritten: true,
      },
    });
    // TG 告警 — fire-and-forget；await 但失败不抛
    void sendBossNotice(
      'TOKEN_BUDGET',
      [
        `🚨 <b>AI 员工撞顶自动暂停</b>`,
        ``,
        `<b>${escapeTgHtml(employee.name)}</b>`,
        `今日已花：HKD ${dailyUsedHkd.toFixed(2)}`,
        `日额度：HKD ${dailyLimit.toFixed(2)}`,
        ``,
        `<i>已自动 paused=true。下次调用会返 429。</i>`,
        `<i>解锁去 /admin/tokens（仅老板）</i>`,
      ].join('\n'),
    ).catch(() => undefined);
  }

  // 9. 公司日预算撞顶 → 当日首次跨阈值时告警一次（避免刷屏）
  //    不冻结任何员工（一个 AI 跑飞冻全员风险大）
  const companyBudget = getCompanyDailyBudgetHkd();
  const companyTodaySpend = await spendByRange(todayStart, todayEnd);
  if (companyTodaySpend > companyBudget) {
    // 当日是否已发过公司预算告警？查一行 log 即可
    const alreadyAlerted = await prisma.aiActivityLog.findFirst({
      where: {
        action: 'company_budget_exceeded',
        createdAt: { gte: todayStart, lt: todayEnd },
      },
      select: { id: true },
    });
    if (!alreadyAlerted) {
      await prisma.aiActivityLog.create({
        data: {
          aiRole: 'system',
          action: 'company_budget_exceeded',
          status: 'success',
          payload: JSON.stringify({
            companyTodaySpend,
            companyBudget,
            triggeredByEmployeeId: employee.id,
            triggeredByName: employee.name,
          }),
          dashboardWritten: true,
        },
      });
      void sendBossNotice(
        'TOKEN_BUDGET',
        [
          `⚠️ <b>公司日预算超支</b>`,
          ``,
          `今日 AI 总花费：HKD ${companyTodaySpend.toFixed(2)}`,
          `公司日预算：HKD ${companyBudget.toFixed(2)}`,
          ``,
          `<i>触发员工：${escapeTgHtml(employee.name)}</i>`,
          `<i>未冻结任何员工。建议去 /admin/tokens 看 Top 员工 + 临时下调单条额度。</i>`,
        ].join('\n'),
      ).catch(() => undefined);
    }
  }

  return NextResponse.json({
    ok: true,
    costHkd: Number(costHkd.toFixed(6)),
    dailyUsedHkd: Number(dailyUsedHkd.toFixed(6)),
    dailyLimitHkd: dailyLimit,
    paused: nowPaused,
    ...(nowPaused
      ? { hint: '本员工已自动暂停（撞顶）。下次调用会返 429。请联系老板解锁。' }
      : {}),
  });
}
