/**
 * AI 平台月订阅单条 CRUD（全员可读可改，2026-05-10 老板放开）
 *
 * PATCH  → 改任意字段（停用 active=false / 改月费 / 改科目 / 设 endedAt 等）
 * DELETE → 软删（active=false + endedAt=now() 不真删，保留入账历史关联，
 *          软删完任何人都能再次 PATCH 把 active 改回 true 救回来）
 *
 * 全员可改的安全保障：
 *   - 软删可逆（不真删行）
 *   - createdById 字段记着首次录入人，撕逼时有据
 *   - 看板透明文化：每条改动看板能查
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  vendor: z.string().min(1).max(40).optional(),
  displayName: z.string().min(1).max(120).optional(),
  monthlyHkd: z.number().positive().max(1_000_000).optional(),
  monthlyAmountOriginal: z.number().positive().max(1_000_000).nullable().optional(),
  currencyOriginal: z.string().min(1).max(10).nullable().optional(),
  billingDay: z.number().int().min(1).max(28).optional(),
  purposeAccount: z.string().min(1).max(100).optional(),
  fundingAccount: z.string().min(1).max(100).optional(),
  startedAt: z.string().min(8).optional(),
  endedAt: z.string().min(8).nullable().optional(),
  active: z.boolean().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await requireUser();
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'INVALID_JSON', hint: '请求 body 不是合法 JSON' },
        { status: 400 },
      );
    }
    const data = patchSchema.parse(body);

    const existing = await prisma.aiCostSubscription.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (data.vendor !== undefined) updateData.vendor = data.vendor;
    if (data.displayName !== undefined) updateData.displayName = data.displayName;
    if (data.monthlyHkd !== undefined) updateData.monthlyHkd = data.monthlyHkd;
    if ('monthlyAmountOriginal' in data) updateData.monthlyAmountOriginal = data.monthlyAmountOriginal;
    if ('currencyOriginal' in data) updateData.currencyOriginal = data.currencyOriginal;
    if (data.billingDay !== undefined) updateData.billingDay = data.billingDay;
    if (data.purposeAccount !== undefined) updateData.purposeAccount = data.purposeAccount;
    if (data.fundingAccount !== undefined) updateData.fundingAccount = data.fundingAccount;
    if (data.startedAt !== undefined) updateData.startedAt = new Date(data.startedAt);
    if ('endedAt' in data) updateData.endedAt = data.endedAt ? new Date(data.endedAt) : null;
    if (data.active !== undefined) updateData.active = data.active;
    if ('notes' in data) updateData.notes = data.notes;

    const sub = await prisma.aiCostSubscription.update({
      where: { id: params.id },
      data: updateData,
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    });

    return NextResponse.json({
      subscription: {
        ...sub,
        monthlyHkd: Number(sub.monthlyHkd),
        monthlyAmountOriginal:
          sub.monthlyAmountOriginal !== null ? Number(sub.monthlyAmountOriginal) : null,
      },
    });
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
    console.error('[ai-subscriptions PATCH] uncaught:', e);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', hint: e instanceof Error ? e.message : '服务端未知错误' },
      { status: 500 },
    );
  }
}

/**
 * 软删：active=false + endedAt=now()。不真删因为
 * AiCostBooking 可能已经引用过它，保留行供历史查询。
 * 老板真要硬删请去 Neon 控制台手工 DELETE（不推荐）。
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await requireUser();
    const existing = await prisma.aiCostSubscription.findUnique({
      where: { id: params.id },
      select: { id: true, active: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    await prisma.aiCostSubscription.update({
      where: { id: params.id },
      data: {
        active: false,
        endedAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true, mode: 'soft_delete' });
  } catch (e) {
    if (e instanceof Response) return e as unknown as NextResponse;
    console.error('[ai-subscriptions DELETE] uncaught:', e);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', hint: e instanceof Error ? e.message : '服务端未知错误' },
      { status: 500 },
    );
  }
}
