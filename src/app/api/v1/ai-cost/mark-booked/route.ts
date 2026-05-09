/**
 * 标记 AI 成本月度已入账（凭证编制员写完 voucher 后调）
 *
 * POST /api/v1/ai-cost/mark-booked
 * X-Api-Key: lty_... (FINANCE_AI:voucher_clerk / FINANCE_AI:cfo / FINANCE_ADMIN)
 *
 * Body：
 *   {
 *     "month": "2026-04",
 *     "aiEmployeeId": "...",   // 二选一（按员工分笔时填）
 *     "subscriptionId": "...", // 二选一（按订阅分笔时填）
 *     "voucherId": "...",      // 必填，刚写完那张 voucher 的 id
 *     "totalHkd": 12.34,       // 必填，落账金额
 *     "meta": { ... }          // 可选，model breakdown 等
 *   }
 *
 * 行为：
 *   1. 校验 voucher 存在 (POSTED/AI_DRAFT/BOSS_REVIEWING 都行)
 *   2. 校验 aiEmployeeId/subscriptionId 二选一有且仅一个
 *   3. 写 AiCostBooking 行，唯一索引 (month, aiEmployeeId, subscriptionId) 防重复
 *   4. 重复入账时返 409 + 现有 bookingId
 *
 * 凭证编制员每写一笔 voucher 立刻调一次本接口，下次跑 period-summary 就看到
 * alreadyBooked=true 不会再算第二遍。
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireAuthOrApiKey } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const ALLOWED_SCOPES = [
  'FINANCE_AI:voucher_clerk',
  'FINANCE_AI:cfo',
  'FINANCE_ADMIN',
];

const bodySchema = z
  .object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month 必须是 YYYY-MM'),
    aiEmployeeId: z.string().min(1).optional().nullable(),
    subscriptionId: z.string().min(1).optional().nullable(),
    voucherId: z.string().min(1),
    totalHkd: z.number().positive().max(1_000_000),
    meta: z.record(z.unknown()).optional(),
  })
  .refine(
    (d) => Boolean(d.aiEmployeeId) !== Boolean(d.subscriptionId),
    { message: 'aiEmployeeId 和 subscriptionId 必须二选一（不能都填或都空）' },
  );

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthOrApiKey(req, ALLOWED_SCOPES, 'EDIT');
    if (auth instanceof NextResponse) return auth;

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'INVALID_JSON', hint: '请求 body 不是合法 JSON' },
        { status: 400 },
      );
    }
    const data = bodySchema.parse(raw);

    // 校验 voucher 存在（不限状态 — 草稿也允许，老板/凭证员可以先写完草稿就标 booked）
    const voucher = await prisma.voucher.findUnique({
      where: { id: data.voucherId },
      select: { id: true, status: true, amount: true, currency: true },
    });
    if (!voucher) {
      return NextResponse.json(
        { error: 'VOUCHER_NOT_FOUND', hint: 'voucherId 找不到对应凭证' },
        { status: 404 },
      );
    }

    // 校验 aiEmployeeId / subscriptionId 真实存在
    if (data.aiEmployeeId) {
      const exists = await prisma.aiEmployee.findUnique({
        where: { id: data.aiEmployeeId },
        select: { id: true },
      });
      if (!exists) {
        return NextResponse.json(
          { error: 'EMPLOYEE_NOT_FOUND', hint: 'aiEmployeeId 找不到' },
          { status: 422 },
        );
      }
    }
    if (data.subscriptionId) {
      const exists = await prisma.aiCostSubscription.findUnique({
        where: { id: data.subscriptionId },
        select: { id: true },
      });
      if (!exists) {
        return NextResponse.json(
          { error: 'SUBSCRIPTION_NOT_FOUND', hint: 'subscriptionId 找不到' },
          { status: 422 },
        );
      }
    }

    // 写入；唯一索引 (month, aiEmployeeId, subscriptionId) 撞了就返 409
    try {
      const bookedById = auth.kind === 'session' ? auth.userId : null;
      const booking = await prisma.aiCostBooking.create({
        data: {
          month: data.month,
          aiEmployeeId: data.aiEmployeeId ?? null,
          subscriptionId: data.subscriptionId ?? null,
          voucherId: data.voucherId,
          totalHkd: data.totalHkd,
          meta:
            data.meta && Object.keys(data.meta).length > 0
              ? (data.meta as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          bookedById,
        },
      });
      return NextResponse.json({ booking, ok: true }, { status: 201 });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // 唯一索引冲突：同 month + 同 employee/subscription 已经 booked
        const existing = await prisma.aiCostBooking.findFirst({
          where: {
            month: data.month,
            aiEmployeeId: data.aiEmployeeId ?? null,
            subscriptionId: data.subscriptionId ?? null,
          },
          select: { id: true, voucherId: true, totalHkd: true, bookedAt: true },
        });
        return NextResponse.json(
          {
            error: 'ALREADY_BOOKED',
            hint: `${data.month} 这条已经入账过 (booking ${existing?.id})，不重复写`,
            existing: existing
              ? {
                  ...existing,
                  totalHkd: Number(existing.totalHkd),
                  bookedAt: existing.bookedAt.toISOString(),
                }
              : null,
          },
          { status: 409 },
        );
      }
      throw e;
    }
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
    console.error('[ai-cost mark-booked POST] uncaught:', e);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', hint: e instanceof Error ? e.message : '服务端未知错误' },
      { status: 500 },
    );
  }
}
