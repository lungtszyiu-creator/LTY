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
  return NextResponse.json({ employees });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const data = createSchema.parse(await req.json());

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
      employee,
      // 仅生成 key 时返 plaintext —— 一次性！
      plaintext_key: plaintextKey,
      _warning: plaintextKey
        ? '请立刻复制保存。本明文 Key 不会再出现，离开本响应后无法找回。'
        : undefined,
    },
    { status: 201 },
  );
}
