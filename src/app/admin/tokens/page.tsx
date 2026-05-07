/**
 * AI Token 监控 — /admin/tokens（Step 2 · 今日 hero）
 *
 * 自上而下结构（按老板节奏分多步）：
 *   1. ✅ Step 2 · 今日 hero（HKD x / y 公司预算 + DoD% + 进度条）
 *   2. ✅ Step 2 · 暂停员工列表（如有撞顶的）
 *   3. ✅ Step 2 · 今日 Top 10 员工 + 今日模型分布
 *   4. ⏳ Step 3 · 历史范围切换 + 趋势图 + 每日明细
 *   5. ⏳ Step 5 · 解锁审批入口
 *
 * 数据真实性铁律：所有 KPI 实时从 prisma 查 TokenUsage 聚合，无任何缓存。
 *
 * 权限：仅 SUPER_ADMIN（老板）— 公司日预算敏感，不让普通 ADMIN 看。
 */
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  startOfTodayHk,
  endOfTodayHk,
  yesterdayBoundariesHk,
  spendByRange,
  callCountByRange,
  topEmployeesByRange,
  modelBreakdownByRange,
  type RangeKey,
} from '@/lib/budget';
import { getCompanyDailyBudgetHkd } from '@/lib/pricing';
import { HistoricalSection } from './_components/HistoricalSection';

export const dynamic = 'force-dynamic';

const VALID_RANGES: RangeKey[] = ['today', '7d', '30d', 'month', 'year'];

export default async function TokensPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  const sp = await searchParams;
  const range: RangeKey = (VALID_RANGES as string[]).includes(sp.range ?? '')
    ? (sp.range as RangeKey)
    : 'today';

  const todayStart = startOfTodayHk();
  const todayEnd = endOfTodayHk();
  const { start: yStart, end: yEnd } = yesterdayBoundariesHk();
  const dailyBudget = getCompanyDailyBudgetHkd();

  // 并行拉所有今日数据
  const [
    todaySpend,
    todayCalls,
    yesterdaySpend,
    pausedEmployees,
    topEmployees,
    modelBreakdown,
  ] = await Promise.all([
    spendByRange(todayStart, todayEnd),
    callCountByRange(todayStart, todayEnd),
    spendByRange(yStart, yEnd),
    prisma.aiEmployee.findMany({
      where: { paused: true },
      orderBy: { pausedAt: 'desc' },
      select: {
        id: true,
        name: true,
        role: true,
        pausedAt: true,
        pauseReason: true,
        dailyLimitHkd: true,
      },
    }),
    topEmployeesByRange(todayStart, todayEnd, 10),
    modelBreakdownByRange(todayStart, todayEnd),
  ]);

  const dodPct =
    yesterdaySpend > 0 ? ((todaySpend - yesterdaySpend) / yesterdaySpend) * 100 : null;
  const budgetPct = dailyBudget > 0 ? (todaySpend / dailyBudget) * 100 : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">AI Token 监控</h1>
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200">
            Step 3 · 历史 + 趋势图
          </span>
        </div>
        <span className="text-xs text-slate-400">
          时区 HK · 撞顶暂停 / 解锁审批 留 Step 5
        </span>
      </header>

      {/* 1. 今日 hero */}
      <TodayHero
        todaySpend={todaySpend}
        dailyBudget={dailyBudget}
        budgetPct={budgetPct}
        todayCalls={todayCalls}
        yesterdaySpend={yesterdaySpend}
        dodPct={dodPct}
      />

      {/* 2. 暂停员工 */}
      {pausedEmployees.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-rose-700">
            ⏸ 暂停中的员工（{pausedEmployees.length}）
          </h2>
          <ul className="space-y-1.5 overflow-hidden rounded-xl border border-rose-200 bg-rose-50/30">
            {pausedEmployees.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-rose-100 px-4 py-2 text-sm last:border-b-0"
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-slate-800">{e.name}</span>
                  <span className="text-xs text-slate-500">{e.role}</span>
                </div>
                <div className="flex items-baseline gap-3 text-xs text-rose-700">
                  {e.pauseReason && <span>{e.pauseReason}</span>}
                  <span className="text-slate-500">
                    日额度 HKD {Number(e.dailyLimitHkd).toLocaleString('zh-HK')}
                  </span>
                  {e.pausedAt && (
                    <time className="text-slate-400">
                      {new Date(e.pausedAt).toLocaleString('zh-HK', { hour12: false })}
                    </time>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 3. 今日 Top 员工 + 模型分布 */}
      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopEmployeesCard rows={topEmployees} todayBudget={dailyBudget} />
        <ModelBreakdownCard rows={modelBreakdown} todaySpend={todaySpend} />
      </section>

      {/* 空状态指引 — 仅当今日 0 调用时显示在 hero 下方；历史区还是有意义 */}
      {todayCalls === 0 && pausedEmployees.length === 0 && (
        <section className="mb-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-6 py-6 text-center text-sm text-slate-500">
          <div className="text-2xl">📡</div>
          <p className="mt-2">今日 0 次 AI 调用 — 等 AI 员工开始上报 token 用量。</p>
          <p className="mt-1 text-xs text-slate-400">
            上报路径：<code className="rounded bg-white px-1">POST /api/v1/token-usage</code>{' '}
            with header <code className="rounded bg-white px-1">x-api-key: lty_…</code>
          </p>
        </section>
      )}

      {/* Step 3: 历史范围 + 趋势图 + 每日明细 */}
      <HistoricalSection range={range} />
    </div>
  );
}

// ============ 子组件 ============

function TodayHero({
  todaySpend,
  dailyBudget,
  budgetPct,
  todayCalls,
  yesterdaySpend,
  dodPct,
}: {
  todaySpend: number;
  dailyBudget: number;
  budgetPct: number;
  todayCalls: number;
  yesterdaySpend: number;
  dodPct: number | null;
}) {
  // 进度条颜色：< 50% 绿，50-80% 黄，> 80% 红
  const barColor =
    budgetPct >= 80
      ? 'bg-rose-500'
      : budgetPct >= 50
      ? 'bg-amber-500'
      : 'bg-emerald-500';
  const barCls =
    budgetPct >= 80
      ? 'border-rose-200/60 bg-rose-50/40'
      : budgetPct >= 50
      ? 'border-amber-200/60 bg-amber-50/40'
      : 'border-emerald-200/60 bg-emerald-50/40';

  return (
    <section className={`mb-6 rounded-2xl border p-5 ${barCls}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
            今日 AI 总花费 · HK 时区
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-4xl font-semibold tabular-nums text-slate-900 sm:text-5xl">
              HKD {todaySpend.toLocaleString('zh-HK', { maximumFractionDigits: 2 })}
            </span>
            <span className="text-sm text-slate-500">
              / {dailyBudget.toLocaleString('zh-HK')} 公司预算
            </span>
          </div>
        </div>
        <div className="flex items-baseline gap-4">
          <KpiBox label="调用次数" value={todayCalls.toLocaleString('zh-HK')} />
          <KpiBox
            label="DoD%"
            value={
              dodPct === null
                ? '—'
                : `${dodPct >= 0 ? '+' : ''}${dodPct.toFixed(1)}%`
            }
            valueColor={
              dodPct === null
                ? 'text-slate-400'
                : dodPct > 20
                ? 'text-rose-600'
                : dodPct < -20
                ? 'text-emerald-600'
                : 'text-slate-700'
            }
            hint={yesterdaySpend > 0 ? `昨 HKD ${yesterdaySpend.toFixed(0)}` : '昨 0'}
          />
        </div>
      </div>

      {/* 进度条 */}
      <div className="mt-4">
        <div className="mb-1 flex items-baseline justify-between text-[11px]">
          <span className="text-slate-500">公司预算消耗</span>
          <span className="font-mono tabular-nums text-slate-700">{budgetPct.toFixed(1)}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-200/60">
          <div
            className={`h-full transition-[width] duration-300 ${barColor}`}
            style={{ width: `${Math.min(100, budgetPct)}%` }}
          />
        </div>
        {budgetPct >= 80 && (
          <div className="mt-2 text-[11px] text-rose-700">
            ⚠️ 已用 {budgetPct.toFixed(1)}%，建议盯紧高额度员工或临时下调日额度。
          </div>
        )}
      </div>
    </section>
  );
}

function KpiBox({
  label,
  value,
  valueColor = 'text-slate-800',
  hint,
}: {
  label: string;
  value: string;
  valueColor?: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-2xl font-semibold tabular-nums ${valueColor}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-slate-400">{hint}</div>}
    </div>
  );
}

function TopEmployeesCard({
  rows,
  todayBudget,
}: {
  rows: Awaited<ReturnType<typeof topEmployeesByRange>>;
  todayBudget: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
        今日 Top 10 员工
      </h2>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">今日无调用</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const pctOfBudget = todayBudget > 0 ? (r.spendHkd / todayBudget) * 100 : 0;
            return (
              <li key={r.employeeId} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0 flex-1 truncate">
                    <span className="font-medium text-slate-800">{r.name}</span>
                    {r.paused && (
                      <span className="ml-1.5 rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] text-rose-700 ring-1 ring-rose-200">
                        ⏸
                      </span>
                    )}
                    <span className="ml-1.5 text-xs text-slate-500">{r.role}</span>
                  </div>
                  <span className="font-mono tabular-nums text-slate-700">
                    HKD {r.spendHkd.toFixed(2)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-baseline justify-between gap-2 text-[10px] text-slate-400">
                  <span>{r.callCount} 次</span>
                  <span>{pctOfBudget.toFixed(1)}% 公司预算</span>
                </div>
                <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-rose-500"
                    style={{ width: `${Math.min(100, pctOfBudget * 5)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ModelBreakdownCard({
  rows,
  todaySpend,
}: {
  rows: Awaited<ReturnType<typeof modelBreakdownByRange>>;
  todaySpend: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
        今日模型分布
      </h2>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">今日无调用</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const pct = todaySpend > 0 ? (r.spendHkd / todaySpend) * 100 : 0;
            return (
              <li key={r.model} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-mono text-xs text-slate-700">{r.model}</span>
                  <span className="font-mono tabular-nums text-slate-700">
                    HKD {r.spendHkd.toFixed(2)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-baseline justify-between gap-2 text-[10px] text-slate-400">
                  <span>
                    {r.callCount} 次 · {(r.inputTokens / 1000).toFixed(1)}k in /{' '}
                    {(r.outputTokens / 1000).toFixed(1)}k out
                  </span>
                  <span>{pct.toFixed(1)}%</span>
                </div>
                <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-violet-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
