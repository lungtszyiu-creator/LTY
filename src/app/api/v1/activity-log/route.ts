/**
 * AI 工作日记公开上报端点
 *
 * 老板 5/10：小许在 AI 部搭 AI 员工，想把成果显示到 /dept/ai 工作日记栏里。
 *
 * POST /api/v1/activity-log
 *   X-Api-Key: lty_xxxx       (任何 active AI 员工的 key 都可调，写自己的 log)
 *   Body:
 *     {
 *       "action": "write_post",       // 必填：短词分类（自由文本，建议 snake_case）
 *       "summary": "整理了 3 篇推文",   // 强烈推荐：给老板看的一句话摘要
 *       "status": "success",           // 可选 "success" | "failed" | "pending"，默认 success
 *       "payload": { ... },            // 可选：自定义 JSON（不会显示给老板，留 audit）
 *       "errorMessage": "...",         // 可选：status=failed 时填
 *       "telegramSent": false,         // 可选：自报是否同时推过 TG
 *       "vaultWritten": false,         // 可选：自报是否写过 vault
 *       "vaultPath": "raw/..."         // 可选：写入 vault 哪个路径（合并进 payload）
 *     }
 *
 * 行为：
 *   1. X-Api-Key 鉴权 → 拿 ApiKey → 反查 AiEmployee
 *   2. 校验 employee 存在 + active=true（paused 时也允许写日记 — 撞顶后还能补记录最后一项工作）
 *   3. summary / vaultPath 合并进 payload JSON（schema 无单独 summary 列；
 *      AiActivityFeed 优先读 payload.summary 显示，没有则 fallback action label）
 *   4. 写 AiActivityLog 行（apiKeyId 关联，aiRole 默认 "ai_employee"）
 *   5. 更新 AiEmployee.lastActiveAt（也算"在跑"，跟 token-usage 同语义）
 *
 * 返回：
 *   { ok: true, id, createdAt, displayedAt: "/dept/ai 工作日记" }
 *
 * 防呆：
 *   - paused 员工不拒：撞顶后 AI 还有未完成工作要交待时也能写一行
 *   - 不限 scope：每个 AI 只能写自己的 log（apiKeyId 强绑），不可越权写别人的
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { hashApiKey } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const writeSchema = z.object({
  action: z.string().min(1).max(80),
  summary: z.string().max(500).optional(),
  status: z.enum(['success', 'failed', 'pending']).optional(),
  payload: z.record(z.unknown()).optional(),
  errorMessage: z.string().max(1000).optional(),
  telegramSent: z.boolean().optional(),
  vaultWritten: z.boolean().optional(),
  vaultPath: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  try {
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
        scope: true,
        aiEmployee: {
          select: { id: true, name: true, active: true, paused: true, role: true },
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
          hint: '本 ApiKey 没挂在任何 AI 员工档案上。先去 /employees 创建员工并绑定 key。',
        },
        { status: 403 },
      );
    }
    if (!apiKey.aiEmployee.active) {
      return NextResponse.json(
        { error: 'EMPLOYEE_INACTIVE', hint: '员工已停用，不能写工作日记' },
        { status: 403 },
      );
    }
    // 注意：paused 员工**不拒**，让 AI 撞顶后还能交待最后一项工作

    // 2. body 校验
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'INVALID_JSON', hint: '请求 body 不是合法 JSON' },
        { status: 400 },
      );
    }
    const data = writeSchema.parse(body);

    // 3. summary / vaultPath 合并进 payload JSON
    //    schema 没单独 summary 列；AiActivityFeed 显示侧约定优先读 payload.summary
    const mergedPayload: Record<string, unknown> = {
      ...(data.payload ?? {}),
      ...(data.summary ? { summary: data.summary } : {}),
      ...(data.vaultPath ? { vaultPath: data.vaultPath } : {}),
    };

    // 4. aiRole：默认 "ai_employee"（通用），AiActivityFeed 按 employeeName 分组
    //    不强求精确分类 — 同一员工名下日记都聚在一张卡里
    const aiRole = 'ai_employee';

    // 5. 写 AiActivityLog + 更新 lastActiveAt（事务保证一致性）
    const [log] = await prisma.$transaction([
      prisma.aiActivityLog.create({
        data: {
          aiRole,
          action: data.action,
          status: data.status ?? 'success',
          apiKeyId: apiKey.id,
          payload:
            Object.keys(mergedPayload).length > 0
              ? JSON.stringify(mergedPayload)
              : null,
          errorMessage: data.errorMessage ?? null,
          telegramSent: data.telegramSent ?? false,
          vaultWritten: data.vaultWritten ?? false,
          dashboardWritten: true,
        },
        select: { id: true, createdAt: true },
      }),
      prisma.aiEmployee.update({
        where: { id: apiKey.aiEmployee.id },
        data: { lastActiveAt: new Date() },
      }),
      prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      id: log.id,
      createdAt: log.createdAt.toISOString(),
      displayedAt: '/dept/ai 今日工作日记',
      hint: '看板已记录。打开 /dept/ai 滚到底「今日 AI 工作日记」栏目能看到这一条。',
    }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e as unknown as NextResponse;
    if (e instanceof z.ZodError) {
      const first = e.issues[0];
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          hint: `字段 ${first?.path.join('.') ?? '?'} 不合法：${first?.message ?? '?'}`,
          issues: e.issues,
        },
        { status: 422 },
      );
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      console.error('[activity-log POST] prisma:', e.code, e.message);
      return NextResponse.json(
        { error: 'DB_ERROR', hint: e.message },
        { status: 500 },
      );
    }
    console.error('[activity-log POST] uncaught:', e);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', hint: e instanceof Error ? e.message : '服务端未知错误' },
      { status: 500 },
    );
  }
}
