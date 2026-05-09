/**
 * AI 平台月订阅 CRUD（全员可读可填，2026-05-10 老板放开）
 *
 * GET  → 列表（按 active 排，活跃在前；同 active 按 vendor + startedAt）
 * POST → 新建（任何 active 员工录入 Coze Credit / Perplexity / Manus /
 *        MiniMax 等月订阅 — 协同填写减少老板单点工作）
 *
 * 入口：/dept/ai/subscriptions（原 /finance/subscriptions 已搬，老板把订阅
 * 当作 AI 部范畴而不是财务）。月底凭证编制员通过 PR-C 的 period-summary
 * endpoint 自动汇总入账。
 *
 * 路径仍在 /api/admin/ 是历史原因（建表时只 SUPER_ADMIN 可改），不再代表
 * "管理员限制"。等下个 PR 闲了再 mv 到 /api/ai-subscriptions。
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  vendor: z.string().min(1).max(40),
  displayName: z.string().min(1).max(120),
  monthlyHkd: z.number().positive().max(1_000_000),
  monthlyAmountOriginal: z.number().positive().max(1_000_000).optional().nullable(),
  currencyOriginal: z.string().min(1).max(10).optional().nullable(),
  billingDay: z.number().int().min(1).max(28).optional(),
  purposeAccount: z.string().min(1).max(100).optional(),
  fundingAccount: z.string().min(1).max(100),
  // ISO date string (YYYY-MM-DD)
  startedAt: z.string().min(8),
  endedAt: z.string().min(8).optional().nullable(),
  active: z.boolean().optional(),
  notes: z.string().max(1000).optional().nullable(),
});

export async function GET() {
  try {
    await requireUser();
    const subs = await prisma.aiCostSubscription.findMany({
      orderBy: [{ active: 'desc' }, { vendor: 'asc' }, { startedAt: 'desc' }],
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
    // Decimal → number for client
    const rows = subs.map((s) => ({
      ...s,
      monthlyHkd: Number(s.monthlyHkd),
      monthlyAmountOriginal:
        s.monthlyAmountOriginal !== null ? Number(s.monthlyAmountOriginal) : null,
    }));
    return NextResponse.json({ subscriptions: rows });
  } catch (e) {
    if (e instanceof Response) return e as unknown as NextResponse;
    console.error('[ai-subscriptions GET] uncaught:', e);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', hint: e instanceof Error ? e.message : '服务端未知错误' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
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

    const sub = await prisma.aiCostSubscription.create({
      data: {
        vendor: data.vendor,
        displayName: data.displayName,
        monthlyHkd: data.monthlyHkd,
        monthlyAmountOriginal: data.monthlyAmountOriginal ?? null,
        currencyOriginal: data.currencyOriginal ?? null,
        billingDay: data.billingDay ?? 1,
        purposeAccount: data.purposeAccount ?? '管理费用-AI 服务费',
        fundingAccount: data.fundingAccount,
        startedAt: new Date(data.startedAt),
        endedAt: data.endedAt ? new Date(data.endedAt) : null,
        active: data.active ?? true,
        notes: data.notes ?? null,
        createdById: user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(
      {
        subscription: {
          ...sub,
          monthlyHkd: Number(sub.monthlyHkd),
          monthlyAmountOriginal:
            sub.monthlyAmountOriginal !== null ? Number(sub.monthlyAmountOriginal) : null,
        },
      },
      { status: 201 },
    );
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
    console.error('[ai-subscriptions POST] uncaught:', e);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', hint: e instanceof Error ? e.message : '服务端未知错误' },
      { status: 500 },
    );
  }
}
