/**
 * Token 监控的时间范围 + 聚合查询（HKD/HK 时区）
 * ==========================================================================
 *
 * 看板 Hero / 历史范围 / 趋势图 等数据源都从这里出。
 *
 * 时区：HK = UTC+8（与北京一致，LTY 香港公司天然契合，无需做时区切换）。
 *
 * 「HK 日」边界：UTC+8 的 00:00:00 ~ 23:59:59。
 * 实现上把"现在"先平移到 +8 时区算出 HK 当日的 0 点，再平移回 UTC 用作
 * Postgres 查询的 `createdAt >= start`。这样跨日时统计不会被 UTC 0 点切断。
 *
 * 数据真实性铁律：每个 KPI 实时从 prisma 查 TokenUsage 聚合，**不依赖任何缓存**。
 *
 * Step 2 只用得到 startOfTodayHk + spendByRange + topEmployees + modelBreakdown。
 * Step 3 加 dateRangeBoundaries 切换 + dailySpendSeries 趋势图。
 */
import { prisma } from './db';

const HK_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8

// ============ 时间边界 ============

/** HK 当日 00:00:00 对应的 UTC Date 对象 */
export function startOfTodayHk(): Date {
  const now = new Date();
  const hk = new Date(now.getTime() + HK_OFFSET_MS);
  hk.setUTCHours(0, 0, 0, 0);
  return new Date(hk.getTime() - HK_OFFSET_MS);
}

/** HK 当日 24:00:00 对应的 UTC Date 对象（= 明日 00:00:00 HK） */
export function endOfTodayHk(): Date {
  return new Date(startOfTodayHk().getTime() + 24 * 60 * 60 * 1000);
}

/** HK 昨日 00:00:00 ~ 24:00:00 — 给 DoD% 对比用 */
export function yesterdayBoundariesHk(): { start: Date; end: Date } {
  const todayStart = startOfTodayHk();
  return {
    start: new Date(todayStart.getTime() - 24 * 60 * 60 * 1000),
    end: todayStart,
  };
}

export type RangeKey = 'today' | '7d' | '30d' | 'month' | 'year';

/** 给定 range key 拿到 [start, end) 区间 + 天数 + 中文 label */
export function dateRangeBoundaries(key: RangeKey): {
  start: Date;
  end: Date;
  days: number;
  label: string;
} {
  const todayStart = startOfTodayHk();
  const tomorrowStart = endOfTodayHk();
  switch (key) {
    case 'today':
      return { start: todayStart, end: tomorrowStart, days: 1, label: '今日' };
    case '7d':
      return {
        start: new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000),
        end: tomorrowStart,
        days: 7,
        label: '近 7 日',
      };
    case '30d':
      return {
        start: new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000),
        end: tomorrowStart,
        days: 30,
        label: '近 30 日',
      };
    case 'month': {
      // 本月（HK 时区）：当月 1 日 00:00 → 明日 00:00（含今天）
      const now = new Date();
      const hk = new Date(now.getTime() + HK_OFFSET_MS);
      hk.setUTCDate(1);
      hk.setUTCHours(0, 0, 0, 0);
      const start = new Date(hk.getTime() - HK_OFFSET_MS);
      const days = Math.ceil((tomorrowStart.getTime() - start.getTime()) / 86400000);
      return { start, end: tomorrowStart, days, label: '本月' };
    }
    case 'year': {
      const now = new Date();
      const hk = new Date(now.getTime() + HK_OFFSET_MS);
      hk.setUTCMonth(0, 1);
      hk.setUTCHours(0, 0, 0, 0);
      const start = new Date(hk.getTime() - HK_OFFSET_MS);
      const days = Math.ceil((tomorrowStart.getTime() - start.getTime()) / 86400000);
      return { start, end: tomorrowStart, days, label: '本年' };
    }
  }
}

// ============ 聚合查询 ============

/** 范围内总花费 HKD（Decimal → number） */
export async function spendByRange(start: Date, end: Date): Promise<number> {
  const r = await prisma.tokenUsage.aggregate({
    where: { createdAt: { gte: start, lt: end } },
    _sum: { costHkd: true },
  });
  return r._sum.costHkd ? Number(r._sum.costHkd) : 0;
}

/** 范围内调用次数 */
export async function callCountByRange(start: Date, end: Date): Promise<number> {
  return prisma.tokenUsage.count({
    where: { createdAt: { gte: start, lt: end } },
  });
}

/** 单员工范围内已花 HKD（Step 5 撞顶判断用） */
export async function employeeSpendByRange(
  employeeId: string,
  start: Date,
  end: Date,
): Promise<number> {
  const r = await prisma.tokenUsage.aggregate({
    where: { employeeId, createdAt: { gte: start, lt: end } },
    _sum: { costHkd: true },
  });
  return r._sum.costHkd ? Number(r._sum.costHkd) : 0;
}

export type EmployeeSpendRow = {
  employeeId: string;
  name: string;
  role: string;
  paused: boolean;
  spendHkd: number;
  callCount: number;
};

/** 范围内 Top N 员工 by 花费 */
export async function topEmployeesByRange(
  start: Date,
  end: Date,
  limit = 10,
): Promise<EmployeeSpendRow[]> {
  const grouped = await prisma.tokenUsage.groupBy({
    by: ['employeeId'],
    where: { createdAt: { gte: start, lt: end } },
    _sum: { costHkd: true },
    _count: { _all: true },
    orderBy: { _sum: { costHkd: 'desc' } },
    take: limit,
  });
  if (grouped.length === 0) return [];
  const employees = await prisma.aiEmployee.findMany({
    where: { id: { in: grouped.map((g) => g.employeeId) } },
    select: { id: true, name: true, role: true, paused: true },
  });
  const eMap = Object.fromEntries(employees.map((e) => [e.id, e]));
  return grouped.map((g) => {
    const e = eMap[g.employeeId];
    return {
      employeeId: g.employeeId,
      name: e?.name ?? '(已删除)',
      role: e?.role ?? '',
      paused: e?.paused ?? false,
      spendHkd: g._sum.costHkd ? Number(g._sum.costHkd) : 0,
      callCount: g._count._all,
    };
  });
}

export type ModelBreakdownRow = {
  model: string;
  spendHkd: number;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
};

/** 范围内按模型分组，看哪个模型在烧钱 */
export async function modelBreakdownByRange(
  start: Date,
  end: Date,
): Promise<ModelBreakdownRow[]> {
  const grouped = await prisma.tokenUsage.groupBy({
    by: ['model'],
    where: { createdAt: { gte: start, lt: end } },
    _sum: { costHkd: true, inputTokens: true, outputTokens: true },
    _count: { _all: true },
    orderBy: { _sum: { costHkd: 'desc' } },
  });
  return grouped.map((g) => ({
    model: g.model,
    spendHkd: g._sum.costHkd ? Number(g._sum.costHkd) : 0,
    callCount: g._count._all,
    inputTokens: g._sum.inputTokens ?? 0,
    outputTokens: g._sum.outputTokens ?? 0,
  }));
}

// ============ 趋势图（Step 3 用）============

/**
 * 按 HK 日期桶聚合，缺日补 0（趋势图用）。
 * 返回数组按日期升序，每项 { date: 'YYYY-MM-DD', spendHkd, cardCount }。
 */
export async function dailySpendSeries(
  start: Date,
  end: Date,
): Promise<{ date: string; spendHkd: number; callCount: number }[]> {
  const rows = await prisma.tokenUsage.findMany({
    where: { createdAt: { gte: start, lt: end } },
    select: { costHkd: true, createdAt: true },
  });
  // 桶按 HK 日期分组
  const buckets = new Map<string, { spendHkd: number; callCount: number }>();
  for (const r of rows) {
    const date = hkDateString(r.createdAt);
    const b = buckets.get(date) ?? { spendHkd: 0, callCount: 0 };
    b.spendHkd += Number(r.costHkd);
    b.callCount += 1;
    buckets.set(date, b);
  }
  // 缺日补 0
  const out: { date: string; spendHkd: number; callCount: number }[] = [];
  const oneDay = 24 * 60 * 60 * 1000;
  for (let t = start.getTime(); t < end.getTime(); t += oneDay) {
    const date = hkDateString(new Date(t));
    const b = buckets.get(date) ?? { spendHkd: 0, callCount: 0 };
    out.push({ date, spendHkd: b.spendHkd, callCount: b.callCount });
  }
  return out;
}

/** UTC Date → HK 时区 "YYYY-MM-DD" 字符串 */
function hkDateString(d: Date): string {
  const hk = new Date(d.getTime() + HK_OFFSET_MS);
  return hk.toISOString().slice(0, 10);
}
