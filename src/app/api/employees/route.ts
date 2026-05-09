/**
 * AI 员工档案 CRUD（移植自 MC Markets · 适配 LTY）
 *
 * GET  → 列表（ADMIN+）
 * POST → 新建，可选生成 API Key（ADMIN+），返 plaintext 一次性
 *
 * API Key 生成：
 *   - 用 LTY 现有 generateApiKey() 拿 plaintext + hashed + prefix（lty_xxx）
 *   - 创建 ApiKey 行，scope 默认 "AI_EMPLOYEE:default"，可由调用方自定义
 *   - AiEmployee.apiKeyId FK 到 ApiKey
 *   - 返回 plaintext 一次（前端弹窗显示，老板必须立刻保存）
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';
import { generateApiKey } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.string().min(1).max(100),
  deptSlug: z.string().nullable().optional(),
  layer: z.number().int().min(1).max(5).optional(),
  dailyLimitHkd: z.number().positive().max(1_000_000).optional(),
  webhookUrl: z.string().url().nullable().optional(),
  // API key 自动生成（一次性返 plaintext）
  generateApiKey: z.boolean().optional(),
  // 自定义 scope（默认 "AI_EMPLOYEE:default"）—— 必须是非空字符串
  apiKeyScope: z.string().min(1).max(100).optional(),
  apiKeyName: z.string().min(1).max(100).optional(),
});

export async function GET() {
  try {
    await requireAdmin();
    const employees = await prisma.aiEmployee.findMany({
      orderBy: [{ active: 'desc' }, { paused: 'desc' }, { layer: 'asc' }, { createdAt: 'desc' }],
      include: {
        apiKey: {
          select: { id: true, keyPrefix: true, scope: true, active: true, revokedAt: true, lastUsedAt: true },
        },
        reportsTo: { select: { id: true, name: true } },
        _count: { select: { reports: true } },
      },
    });
    // ⚠️ Prisma Decimal 默认 JSON 序列化成字符串 ("100")，
    // 前端表单 useState(row.dailyLimitHkd) 拿到字符串，老板不改输入框
    // 直接保存 → PATCH body 里 dailyLimitHkd 是 "100" → Zod
    // .number() 拒收 → 422 "Expected number, received string"。
    // 这里强制 Number() 跟 /employees/page.tsx 服务端首屏 SSR 路径一致。
    const rows = employees.map((e) => ({
      ...e,
      dailyLimitHkd: Number(e.dailyLimitHkd),
      reportsCount: e._count.reports,
    }));
    return NextResponse.json({ employees: rows });
  } catch (e) {
    if (e instanceof Response) return e as unknown as NextResponse;
    console.error('[employees GET] uncaught:', e);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', hint: e instanceof Error ? e.message : '服务端未知错误' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  // 跟 PATCH 同步包 try/catch，让 Zod / requireAdmin 错误返 JSON 不返空 body
  try {
    const admin = await requireAdmin();
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'INVALID_JSON', hint: '请求 body 不是合法 JSON' },
        { status: 400 },
      );
    }
    const data = createSchema.parse(body);

    // 如要生成 key，先建 ApiKey 行（用 LTY 现有 lib/api-auth.ts）
    let apiKeyRow: { id: string } | null = null;
    let plaintextKey: string | null = null;
    if (data.generateApiKey) {
      const { plaintext, hashed, prefix } = generateApiKey();
      plaintextKey = plaintext;
      apiKeyRow = await prisma.apiKey.create({
        data: {
          name: data.apiKeyName ?? `${data.name} - ${new Date().toISOString().slice(0, 10)}`,
          hashedKey: hashed,
          keyPrefix: prefix,
          scope: data.apiKeyScope ?? 'AI_EMPLOYEE:default',
          active: true,
          createdById: admin.id,
        },
        select: { id: true },
      });
    }

    const employee = await prisma.aiEmployee.create({
      data: {
        name: data.name,
        role: data.role,
        deptSlug: data.deptSlug ?? null,
        layer: data.layer ?? 3,
        dailyLimitHkd: data.dailyLimitHkd ?? 1000,
        webhookUrl: data.webhookUrl ?? null,
        apiKeyId: apiKeyRow?.id ?? null,
      },
      include: {
        apiKey: {
          select: { id: true, keyPrefix: true, scope: true, active: true, revokedAt: true, lastUsedAt: true },
        },
      },
    });

    return NextResponse.json(
      {
        // Decimal → number 给前端用
        employee: { ...employee, dailyLimitHkd: Number(employee.dailyLimitHkd) },
        // 仅生成 key 时返 plaintext —— 一次性！
        plaintext_key: plaintextKey,
        _warning: plaintextKey
          ? '请立刻复制保存。本明文 Key 不会再出现，离开本响应后无法找回。'
          : undefined,
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof Response) return e as unknown as NextResponse;
    if (e instanceof z.ZodError) {
      const first = e.issues[0];
      const fieldPath = first?.path.join('.');
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          hint: `字段 ${fieldPath ?? '?'} 不合法：${first?.message ?? '未知校验错误'}`,
          issues: e.issues,
        },
        { status: 422 },
      );
    }
    console.error('[employees POST] uncaught:', e);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', hint: e instanceof Error ? e.message : '服务端未知错误' },
      { status: 500 },
    );
  }
}
