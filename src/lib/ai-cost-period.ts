/**
 * AI 月度成本汇总核心逻辑（共用层）
 *
 * 给三处用：
 *  1. /api/v1/ai-cost/period-summary — 凭证编制员调，月底拿数据写 voucher
 *  2. /dept/ai 顶部「未入账」卡片 server-side 直接调
 *  3. /finance/subscriptions SOP 卡片例子展示
 *
 * 算法：
 *  - 给定 month (yyyy-mm)：
 *    - 算 [start, nextMonthStart) HK 时区边界
 *    - TokenUsage groupBy employee + model，加 costHkd
 *    - AiCostSubscription where active && startedAt <= monthEnd && (endedAt null || endedAt >= monthStart)
 *    - 跟 AiCostBooking 比对，标 alreadyBooked
 */
import { prisma } from './db';

export type TokenCostByEmployee = {
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  totalHkd: number;
  callsCount: number;
  modelBreakdown: { model: string; hkd: number; calls: number }[];
  alreadyBooked: boolean;
  voucherId: string | null;
  bookingId: string | null;
};

export type SubscriptionCost = {
  subscriptionId: string;
  vendor: string;
  displayName: string;
  monthlyHkd: number;
  purposeAccount: string;
  fundingAccount: string;
  alreadyBooked: boolean;
  voucherId: string | null;
  bookingId: string | null;
};

export type PeriodSummary = {
  month: string;
  monthStart: string; // ISO
  monthEnd: string;   // ISO (exclusive — first day of next month)
  tokenCosts: TokenCostByEmployee[];
  subscriptions: SubscriptionCost[];
  totals: {
    tokenHkd: number;
    subscriptionHkd: number;
    grandTotalHkd: number;
    alreadyBookedHkd: number;
    pendingHkd: number;
  };
};

/** "2026-04" → [2026-04-01T00:00:00 HK, 2026-05-01T00:00:00 HK) */
export function monthBoundariesHk(month: string): { start: Date; end: Date } {
  const m = month.match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new Error(`月份格式必须是 YYYY-MM (got ${month})`);
  const year = Number(m[1]);
  const mon = Number(m[2]);
  // HK = UTC+8。把 1 号 00:00 HK 时间转成 UTC = 当月 1 号 16:00 UTC of 上一日
  // 简单做法：直接用 Date.UTC 取当月 1 号 00 UTC，再减 8 小时（即 -8h offset = HK 时区）
  // 月底 = 下月 1 号 00 HK
  const start = new Date(Date.UTC(year, mon - 1, 1, -8, 0, 0)); // 实际是上月最后日 16:00 UTC
  const end = new Date(Date.UTC(year, mon, 1, -8, 0, 0));
  return { start, end };
}

/** 给一个 Date 算出它在 HK 时区下的 yyyy-MM */
export function hkMonthOf(d: Date): string {
  // 加 8 小时换到 HK 视角
  const hk = new Date(d.getTime() + 8 * 3600_000);
  const y = hk.getUTCFullYear();
  const mm = String(hk.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${mm}`;
}

/** 计算给定月份的 AI 成本汇总（不修改任何数据，纯查 + 聚合） */
export async function computePeriodSummary(month: string): Promise<PeriodSummary> {
  const { start, end } = monthBoundariesHk(month);

  // 1. TokenUsage 按 employee + model 聚合
  const tokenRows = await prisma.tokenUsage.groupBy({
    by: ['employeeId', 'model'],
    where: { createdAt: { gte: start, lt: end } },
    _sum: { costHkd: true },
    _count: { _all: true },
  });

  // 拉员工名 + role
  const employeeIds = Array.from(new Set(tokenRows.map((r) => r.employeeId)));
  const employees =
    employeeIds.length > 0
      ? await prisma.aiEmployee.findMany({
          where: { id: { in: employeeIds } },
          select: { id: true, name: true, role: true },
        })
      : [];
  const empMap = new Map(employees.map((e) => [e.id, e]));

  // 按 employee 合并 model 行
  const byEmployee = new Map<
    string,
    {
      totalHkd: number;
      callsCount: number;
      modelBreakdown: { model: string; hkd: number; calls: number }[];
    }
  >();
  for (const r of tokenRows) {
    let bucket = byEmployee.get(r.employeeId);
    if (!bucket) {
      bucket = { totalHkd: 0, callsCount: 0, modelBreakdown: [] };
      byEmployee.set(r.employeeId, bucket);
    }
    const hkd = Number(r._sum.costHkd ?? 0);
    bucket.totalHkd += hkd;
    bucket.callsCount += r._count._all;
    bucket.modelBreakdown.push({ model: r.model, hkd, calls: r._count._all });
  }

  // 2. AiCostSubscription：active + 月份覆盖
  const subs = await prisma.aiCostSubscription.findMany({
    where: {
      active: true,
      startedAt: { lt: end },
      OR: [{ endedAt: null }, { endedAt: { gte: start } }],
    },
    orderBy: [{ vendor: 'asc' }, { startedAt: 'asc' }],
  });

  // 3. 拉本月所有 AiCostBooking 标 alreadyBooked
  const bookings = await prisma.aiCostBooking.findMany({
    where: { month },
    select: {
      id: true,
      aiEmployeeId: true,
      subscriptionId: true,
      voucherId: true,
      totalHkd: true,
    },
  });
  const empBookingMap = new Map(
    bookings
      .filter((b) => b.aiEmployeeId && !b.subscriptionId)
      .map((b) => [b.aiEmployeeId!, b]),
  );
  const subBookingMap = new Map(
    bookings
      .filter((b) => b.subscriptionId && !b.aiEmployeeId)
      .map((b) => [b.subscriptionId!, b]),
  );

  // 拼装结果
  const tokenCosts: TokenCostByEmployee[] = Array.from(byEmployee.entries())
    .map(([empId, bucket]) => {
      const emp = empMap.get(empId);
      const booking = empBookingMap.get(empId);
      return {
        employeeId: empId,
        employeeName: emp?.name ?? '(已删除员工)',
        employeeRole: emp?.role ?? '',
        totalHkd: Number(bucket.totalHkd.toFixed(2)),
        callsCount: bucket.callsCount,
        modelBreakdown: bucket.modelBreakdown
          .map((m) => ({ ...m, hkd: Number(m.hkd.toFixed(2)) }))
          .sort((a, b) => b.hkd - a.hkd),
        alreadyBooked: !!booking,
        voucherId: booking?.voucherId ?? null,
        bookingId: booking?.id ?? null,
      };
    })
    .filter((r) => r.totalHkd > 0)
    .sort((a, b) => b.totalHkd - a.totalHkd);

  const subscriptions: SubscriptionCost[] = subs.map((s) => {
    const booking = subBookingMap.get(s.id);
    return {
      subscriptionId: s.id,
      vendor: s.vendor,
      displayName: s.displayName,
      monthlyHkd: Number(s.monthlyHkd),
      purposeAccount: s.purposeAccount,
      fundingAccount: s.fundingAccount,
      alreadyBooked: !!booking,
      voucherId: booking?.voucherId ?? null,
      bookingId: booking?.id ?? null,
    };
  });

  const tokenTotal = tokenCosts.reduce((s, r) => s + r.totalHkd, 0);
  const subTotal = subscriptions.reduce((s, r) => s + r.monthlyHkd, 0);
  const alreadyBookedHkd =
    tokenCosts.filter((r) => r.alreadyBooked).reduce((s, r) => s + r.totalHkd, 0) +
    subscriptions.filter((r) => r.alreadyBooked).reduce((s, r) => s + r.monthlyHkd, 0);
  const grand = tokenTotal + subTotal;

  return {
    month,
    monthStart: start.toISOString(),
    monthEnd: end.toISOString(),
    tokenCosts,
    subscriptions,
    totals: {
      tokenHkd: Number(tokenTotal.toFixed(2)),
      subscriptionHkd: Number(subTotal.toFixed(2)),
      grandTotalHkd: Number(grand.toFixed(2)),
      alreadyBookedHkd: Number(alreadyBookedHkd.toFixed(2)),
      pendingHkd: Number((grand - alreadyBookedHkd).toFixed(2)),
    },
  };
}
