/**
 * AI 员工档案单条 CRUD
 *
 * GET    → 详情（ADMIN+）
 * PATCH  → 修改 active / name / role / deptSlug / layer / dailyLimitHkd /
 *          webhookUrl / reportsToId / isSupervisor（ADMIN+）
 * DELETE → 硬删（仅 SUPER_ADMIN）— 同时吊销关联 ApiKey；
 *          下属隶属字段被 SetNull 自动清空（schema 级 ON DELETE）
 *
 * PATCH 防呆：
 *   - reportsToId === self.id → 422 cannot_report_to_self
 *   - isSupervisor: true → false 时，自动把所有 reports 的 reportsToId 清成 null
 *     （防孤儿引用，符合 MC Markets 原版语义）
 *
 * 注意：Step 1 schema 已含 reportsToId / isSupervisor 字段。Step 4 的 UI 才会
 * 真正用这两个字段，但 PATCH 后端这里一并实现，避免 Step 4 还要回头改路由。
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin, requireSuperAdmin } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.string().min(1).max(100).optional(),
  deptSlug: z.string().nullable().optional(),
  layer: z.number().int().min(1).max(5).optional(),
  active: z.boolean().optional(),
  dailyLimitHkd: z.number().positive().max(1_000_000).optional(),
  webhookUrl: z.string().url().nullable().optional(),
  reportsToId: z.string().nullable().optional(),
  isSupervisor: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  await requireAdmin();
  const employee = await prisma.aiEmployee.findUnique({
    where: { id: params.id },
    include: {
      apiKey: {
        select: { id: true, keyPrefix: true, scope: true, active: true, revokedAt: true, lastUsedAt: true },
      },
      reportsTo: { select: { id: true, name: true } },
      reports: { select: { id: true, name: true, role: true } },
    },
  });
  if (!employee) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  return NextResponse.json({ employee });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  await requireAdmin();
  const data = patchSchema.parse(await req.json());

  const existing = await prisma.aiEmployee.findUnique({
    where: { id: params.id },
    select: { id: true, isSupervisor: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  // 防呆：不能把自己设成自己的上司
  if (data.reportsToId === params.id) {
    return NextResponse.json(
      { error: 'cannot_report_to_self', hint: '员工不能指自己当上司' },
      { status: 422 },
    );
  }

  // 防呆：reportsToId 必须指向一个 isSupervisor=true && active 的员工
  if (data.reportsToId) {
    const supervisor = await prisma.aiEmployee.findUnique({
      where: { id: data.reportsToId },
      select: { isSupervisor: true, active: true },
    });
    if (!supervisor) {
      return NextResponse.json(
        { error: 'supervisor_not_found' },
        { status: 422 },
      );
    }
    if (!supervisor.isSupervisor) {
      return NextResponse.json(
        { error: 'not_in_supervisor_pool', hint: '目标员工不在上司池内（先把他设为上司）' },
        { status: 422 },
      );
    }
    if (!supervisor.active) {
      return NextResponse.json(
        { error: 'supervisor_inactive', hint: '目标员工已停用' },
        { status: 422 },
      );
    }
  }

  // 取消上司身份时（true → false），自动清空所有下属的 reportsToId
  // 用事务保证一致性
  if (existing.isSupervisor && data.isSupervisor === false) {
    const updated = await prisma.$transaction([
      prisma.aiEmployee.updateMany({
        where: { reportsToId: params.id },
        data: { reportsToId: null },
      }),
      prisma.aiEmployee.update({
        where: { id: params.id },
        data: cleanPatchData(data),
        include: {
          apiKey: {
            select: { id: true, keyPrefix: true, scope: true, active: true, revokedAt: true, lastUsedAt: true },
          },
          reportsTo: { select: { id: true, name: true } },
        },
      }),
    ]);
    return NextResponse.json({ employee: updated[1], orphanedReports: updated[0].count });
  }

  const employee = await prisma.aiEmployee.update({
    where: { id: params.id },
    data: cleanPatchData(data),
    include: {
      apiKey: {
        select: { id: true, keyPrefix: true, scope: true, active: true, revokedAt: true, lastUsedAt: true },
      },
      reportsTo: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ employee });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const admin = await requireSuperAdmin();
  const existing = await prisma.aiEmployee.findUnique({
    where: { id: params.id },
    select: { id: true, apiKeyId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  // Step 2 上线 TokenUsage 后这里要加 "无业务行才能删" 校验。
  // Step 1 暂无业务关联，直接删即可。
  await prisma.$transaction(async (tx) => {
    // 关联 ApiKey 同步吊销（保留行用于审计，置 revokedAt + active=false）
    if (existing.apiKeyId) {
      await tx.apiKey.update({
        where: { id: existing.apiKeyId },
        data: { active: false, revokedAt: new Date(), revokedById: admin.id },
      });
    }
    // 下属的 reportsToId 自动 SetNull（schema FK 级），不用手动清
    await tx.aiEmployee.delete({ where: { id: params.id } });
  });
  return NextResponse.json({ ok: true });
}

/** 把 patchSchema 解析后的 data 转成 prisma update 接受的格式（处理 null vs undefined） */
function cleanPatchData(data: z.infer<typeof patchSchema>) {
  const out: Record<string, unknown> = {};
  if (data.name !== undefined) out.name = data.name;
  if (data.role !== undefined) out.role = data.role;
  if ('deptSlug' in data) out.deptSlug = data.deptSlug;
  if (data.layer !== undefined) out.layer = data.layer;
  if (data.active !== undefined) out.active = data.active;
  if (data.dailyLimitHkd !== undefined) out.dailyLimitHkd = data.dailyLimitHkd;
  if ('webhookUrl' in data) out.webhookUrl = data.webhookUrl;
  if ('reportsToId' in data) out.reportsToId = data.reportsToId;
  if (data.isSupervisor !== undefined) out.isSupervisor = data.isSupervisor;
  return out;
}
