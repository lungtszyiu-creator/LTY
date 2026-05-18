/**
 * AI 输出归集端点（防 vault 污染 paradigm · 5/18 起）
 *
 * Maggie 5/18 反馈：法务部 8 个 Bot 输出（合同审查 3 文本 / 牌照答疑 / 周报）
 * 不能直接写 vault（lty-vault GitHub repo = "经人工整理后的目录"），会污染
 * 人工知识库。
 *
 * Paradigm：
 *   1. AI Bot 调本端点 POST → 落 AiOutput 表 (reviewStatus=pending_human_review)
 *   2. 人在 /dept/lty-legal?tab=ai-outputs 或 /dept/mc-legal?tab=ai-outputs 审核
 *   3. approved → 系统自动 commit 到 vault `raw/<部门>/AI-审核通过/...`
 *   4. rejected → 留 audit 不入 vault
 *
 * 注意 paradigm 通用：deptSlug 是 String 不绑 enum，初期 lty-legal/mc-legal，
 * 后续行政/HR/财务 Bot 想做"审核 inbox"时直接复用本端点。
 *
 * POST /api/v1/ai-outputs
 *   X-Api-Key: lty_xxxx
 *     必须挂在 AI 员工档案上（active），按 AI 员工 deptSlug 自动路由部门
 *     scope 接受任意 *_ADMIN / *_AI:* （宽松鉴权，跟 activity-log 同款）
 *     paused / inactive / deptSlug=null 都拒
 *
 *   Body（Maggie spec V5 一字不差直接接受，所有字段除 outputType / title / contentMarkdown 都选填）：
 *     {
 *       "output_id": "lty-contract-20260518T1234",   // 选填 · Bot 提供幂等 key，upsert 防重
 *       "agent_name": "LTY-合同审查",                 // 选填 · 默认用 AI 员工档案 name
 *       "agent_department": "LTY_LEGAL",              // 选填 · 跨部门 AI 路由 override（小心，跟 deptSlug 校验）
 *       "output_type": "contract_review",
 *       "title": "...",
 *       "content_markdown": "...",                    // 主报告 最长 50000 字符
 *       "revised_contract": "...",                    // 选填 · contract_review 用
 *       "clean_contract": "...",                      // 选填 · contract_review 用
 *       "source_input": "...",                        // 选填 · 原始输入 留 audit
 *       "metadata": { ... },                          // 选填 · 任意 JSON
 *       "triggered_by": "@username",                  // 选填
 *       "review_status": "pending_human_review",      // 选填 · 默认 pending；AI 不该直接传 approved
 *       "token_cost_hkd": 0.123                       // 选填
 *     }
 *
 * 返回 (201 created / 200 updated via outputId upsert)：
 *   { ok, id, action: "created"|"updated", reviewStatus, displayedAt, aiActivityLogId }
 *
 * 错误：
 *   401 / 403 鉴权 · 403 DEPT_MISMATCH (agent_department 跟 AI 档案 deptSlug 冲突)
 *   413 PAYLOAD_TOO_LARGE · 422 VALIDATION_FAILED
 */
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { hashApiKey } from '@/lib/api-auth';
import { logAiActivity } from '@/lib/ai-log';

export const dynamic = 'force-dynamic';

/** agent_department alias → deptSlug 归一（兼容 Maggie spec V5 大写枚举 + 我们小写 slug） */
const AGENT_DEPT_TO_SLUG: Record<string, string> = {
  LTY_LEGAL: 'lty-legal',
  'lty-legal': 'lty-legal',
  MC_LEGAL: 'mc-legal',
  'mc-legal': 'mc-legal',
  // 未来扩：ADMIN → admin / HR → hr / FINANCE → finance / CASHIER → cashier
  ADMIN: 'admin',
  admin: 'admin',
  HR: 'hr',
  hr: 'hr',
  FINANCE: 'finance',
  finance: 'finance',
  CASHIER: 'cashier',
  cashier: 'cashier',
};

const writeSchema = z.object({
  // 必填 3 项
  output_type: z.string().min(1).max(50),
  title: z.string().min(1).max(500),
  content_markdown: z.string().min(1).max(50000),

  // 选填
  output_id: z.string().min(1).max(200).optional(),
  agent_name: z.string().min(1).max(200).optional(),
  agent_department: z.string().optional(),
  revised_contract: z.string().max(50000).optional(),
  clean_contract: z.string().max(50000).optional(),
  source_input: z.string().max(30000).optional(),
  metadata: z.record(z.unknown()).optional(),
  triggered_by: z.string().max(200).optional(),
  review_status: z
    .enum(['pending_human_review', 'approved', 'rejected'])
    .optional(),
  token_cost_hkd: z.number().nonnegative().optional(),
});

export async function POST(req: NextRequest) {
  // 1. X-Api-Key 鉴权（同 activity-log / vault-commit pattern：不强 scope）
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
        select: {
          id: true,
          name: true,
          role: true,
          deptSlug: true,
          active: true,
          paused: true,
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
        hint: '本 ApiKey 没挂在任何 AI 员工档案上。先去 /employees 创建员工并绑定 key。',
      },
      { status: 403 },
    );
  }
  if (!apiKey.aiEmployee.active) {
    return NextResponse.json(
      { error: 'EMPLOYEE_INACTIVE', hint: '员工已停用' },
      { status: 403 },
    );
  }
  if (apiKey.aiEmployee.paused) {
    return NextResponse.json(
      { error: 'EMPLOYEE_PAUSED', hint: 'AI 员工撞顶暂停中，等老板解锁' },
      { status: 403 },
    );
  }

  const employeeDeptSlug = apiKey.aiEmployee.deptSlug;
  if (!employeeDeptSlug) {
    return NextResponse.json(
      {
        error: 'DEPT_NOT_SET',
        hint: 'AI 员工档案没设部门（deptSlug=null）。去 /employees 编辑该 AI 选「归属部门」后再调本接口。',
      },
      { status: 403 },
    );
  }

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
  const parsed = writeSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: 'VALIDATION_FAILED',
        hint: `字段 ${first?.path.join('.') ?? '?'} 不合法：${first?.message ?? '?'}`,
        issues: parsed.error.issues,
      },
      { status: 422 },
    );
  }
  const d = parsed.data;

  // 3. deptSlug 路由 + 越界防护
  // 默认用 AI 档案 deptSlug；如果显式传 agent_department 且跟档案不匹配 → 403
  let deptSlug = employeeDeptSlug;
  if (d.agent_department) {
    const requested = AGENT_DEPT_TO_SLUG[d.agent_department];
    if (!requested) {
      return NextResponse.json(
        {
          error: 'AGENT_DEPARTMENT_UNKNOWN',
          hint: `agent_department=${d.agent_department} 未识别。接受 LTY_LEGAL/MC_LEGAL/ADMIN/HR/FINANCE/CASHIER 或对应小写 slug`,
        },
        { status: 422 },
      );
    }
    if (requested !== employeeDeptSlug) {
      return NextResponse.json(
        {
          error: 'DEPT_MISMATCH',
          hint: `本 AI 员工 deptSlug=${employeeDeptSlug}，但 body agent_department=${d.agent_department}（=${requested}）。不允许跨部门写入；要写其他部门请用对应部门的 AI 员工 key。`,
        },
        { status: 403 },
      );
    }
    deptSlug = requested;
  }

  // 4. review_status 防护：AI 不能直接传 approved/rejected（防止 AI 越权审批）
  // 静默归一回 pending（不报错——Bot spec 里写 "pending_human_review" 也能过）
  if (d.review_status && d.review_status !== 'pending_human_review') {
    console.warn(
      `[ai-outputs POST] AI 试图直接传 review_status=${d.review_status}，强制归一为 pending_human_review`,
    );
  }
  const reviewStatus = 'pending_human_review';

  const agentName = d.agent_name ?? apiKey.aiEmployee.name;

  // 5. 写入（upsert by outputId 防 Bot 重试）
  try {
    let aiOutput;
    let action: 'created' | 'updated';

    if (d.output_id) {
      const existing = await prisma.aiOutput.findUnique({
        where: { outputId: d.output_id },
        select: { id: true, deptSlug: true, reviewStatus: true },
      });
      if (existing) {
        // 已存在 → upsert：但只允许 pending_human_review 状态下覆盖（防 AI 把已 approved 的覆盖掉）
        if (existing.reviewStatus !== 'pending_human_review') {
          return NextResponse.json(
            {
              error: 'OUTPUT_ALREADY_REVIEWED',
              hint: `output_id=${d.output_id} 已被人工审核（${existing.reviewStatus}），不能覆盖。请换新 output_id 重新提交。`,
              existingId: existing.id,
              existingStatus: existing.reviewStatus,
            },
            { status: 409 },
          );
        }
        if (existing.deptSlug !== deptSlug) {
          return NextResponse.json(
            {
              error: 'OUTPUT_DEPT_LOCKED',
              hint: `output_id=${d.output_id} 已绑定 dept=${existing.deptSlug}，不能改成 ${deptSlug}`,
            },
            { status: 403 },
          );
        }
        aiOutput = await prisma.aiOutput.update({
          where: { id: existing.id },
          data: {
            agentName,
            outputType: d.output_type,
            title: d.title,
            contentMarkdown: d.content_markdown,
            revisedDoc: d.revised_contract ?? null,
            cleanDoc: d.clean_contract ?? null,
            sourceInput: d.source_input ?? null,
            metadata: d.metadata ? (d.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
            triggeredBy: d.triggered_by ?? null,
            tokenCostHkd: d.token_cost_hkd ?? null,
            apiKeyId: apiKey.id,
          },
          select: { id: true, createdAt: true, updatedAt: true, reviewStatus: true },
        });
        action = 'updated';
      } else {
        aiOutput = await prisma.aiOutput.create({
          data: {
            outputId: d.output_id,
            agentName,
            deptSlug,
            outputType: d.output_type,
            title: d.title,
            contentMarkdown: d.content_markdown,
            revisedDoc: d.revised_contract ?? null,
            cleanDoc: d.clean_contract ?? null,
            sourceInput: d.source_input ?? null,
            metadata: d.metadata ? (d.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
            triggeredBy: d.triggered_by ?? null,
            reviewStatus,
            tokenCostHkd: d.token_cost_hkd ?? null,
            apiKeyId: apiKey.id,
          },
          select: { id: true, createdAt: true, updatedAt: true, reviewStatus: true },
        });
        action = 'created';
      }
    } else {
      aiOutput = await prisma.aiOutput.create({
        data: {
          agentName,
          deptSlug,
          outputType: d.output_type,
          title: d.title,
          contentMarkdown: d.content_markdown,
          revisedDoc: d.revised_contract ?? null,
          cleanDoc: d.clean_contract ?? null,
          sourceInput: d.source_input ?? null,
          metadata: d.metadata ? (d.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
          triggeredBy: d.triggered_by ?? null,
          reviewStatus,
          tokenCostHkd: d.token_cost_hkd ?? null,
          apiKeyId: apiKey.id,
        },
        select: { id: true, createdAt: true, updatedAt: true, reviewStatus: true },
      });
      action = 'created';
    }

    // 6. 自动写 activity-log → /dept/ai 工作日记同步出现一条
    const aiActivityLogId = await logAiActivity({
      aiRole: apiKey.aiEmployee.role || 'ai_output',
      action: `ai_output:${d.output_type}`,
      apiKeyId: apiKey.id,
      payload: {
        summary: `${action === 'created' ? '提交' : '更新'} AI 输出待审：${d.title}（${agentName}）`,
        aiOutputId: aiOutput.id,
        outputType: d.output_type,
        deptSlug,
        reviewStatus: aiOutput.reviewStatus,
      },
    }).catch(() => null);

    // 7. revalidate 部门看板（PR B 加 ai-outputs tab 时该 tab 自动刷新）
    revalidatePath(`/dept/${deptSlug}`);

    return NextResponse.json(
      {
        ok: true,
        id: aiOutput.id,
        action,
        reviewStatus: aiOutput.reviewStatus,
        createdAt: aiOutput.createdAt.toISOString(),
        updatedAt: aiOutput.updatedAt.toISOString(),
        displayedAt: `/dept/${deptSlug}?tab=ai-outputs`,
        aiActivityLogId,
        hint:
          action === 'created'
            ? '输出已落待审 inbox。需要人工审批后才会自动 commit 到 vault — 不会污染人工目录。审核入口：/dept/' +
              deptSlug +
              '?tab=ai-outputs（看板下一个 PR 上线）'
            : '同 output_id 已存在 pending 状态记录，已覆盖（已审核的不能改）',
      },
      { status: action === 'created' ? 201 : 200 },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      console.error('[ai-outputs POST] prisma:', e.code, e.message);
      return NextResponse.json(
        { error: 'DB_ERROR', code: e.code, hint: e.message },
        { status: 500 },
      );
    }
    console.error('[ai-outputs POST] uncaught:', e);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', hint: e instanceof Error ? e.message : '?' },
      { status: 500 },
    );
  }
}
