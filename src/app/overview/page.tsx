/**
 * AI 总览 — /overview
 *
 * 老板的 "AI 模块单页总览"：一打开就能看完今天 AI 在干什么、烧了多少钱、
 * 谁撞顶了、最近活跃的员工有谁。
 *
 * 自上而下：
 *   1. 今日 hero（HKD x / 500 公司预算 + DoD% + 进度条）
 *   2. 暂停员工列表 + 一键 ✅ 解锁（仅 SUPER_ADMIN）
 *   3. 今日 Top 10 员工 + 今日模型分布
 *   4. AI 员工概览块（最近活跃 6 个 + 全员链接 → /employees 完整 CRUD）
 *   5. 历史范围切换（today/7d/30d/月/年）+ 4 KPI + 趋势图 + 每日明细
 *
 * 这一页取代了 /admin/tokens（保留 redirect）。理由：老板要在「总览」入口
 * 就看到 AI 全貌，而不是分两个菜单（总览 / Token 监控）。/employees 保留作
 * 为完整 CRUD 操作页。
 *
 * 数据真实性铁律：所有 KPI 实时从 prisma 查 TokenUsage 聚合，无任何缓存。
 *
 * 权限：仅 SUPER_ADMIN（老板）。公司日预算 + 撞顶事件都涉及钱，不让普通
 * ADMIN 看。
 */
import Link from 'next/link';
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
import { UnpauseButton } from './_components/UnpauseButton';

export const dynamic = 'force-dynamic';

const VALID_RANGES: RangeKey[] = ['today', '7d', '30d', 'month', 'year'];

export default async function OverviewPage({
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

  const [
    todaySpend,
    todayCalls,
    yesterdaySpend,
    pausedEmployees,
    topEmployees,
    modelBreakdown,
    employeeStats,
    recentEmployees,
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
    // AI 员工统计：总数 / active / 上司
    prisma.aiEmployee.groupBy({
      by: ['active', 'isSupervisor'],
      _count: { _all: true },
    }),
    // 最近活跃 6 个 AI 员工（活跃 = 有 lastActiveAt）
    prisma.aiEmployee.findMany({
      where: { active: true, lastActiveAt: { not: null } },
      orderBy: { lastActiveAt: 'desc' },
      take: 6,
      select: {
        id: true,
        name: true,
        role: true,
        deptSlug: true,
        paused: true,
        lastActiveAt: true,
        dailyLimitHkd: true,
      },
    }),
  ]);

  const dodPct =
    yesterdaySpend > 0 ? ((todaySpend - yesterdaySpend) / yesterdaySpend) * 100 : null;
  const budgetPct = dailyBudget > 0 ? (todaySpend / dailyBudget) * 100 : 0;

  const totalEmployees = employeeStats.reduce((s, x) => s + x._count._all, 0);
  const activeEmployees = employeeStats
    .filter((x) => x.active)
    .reduce((s, x) => s + x._count._all, 0);
  const supervisorCount = employeeStats
    .filter((x) => x.isSupervisor)
    .reduce((s, x) => s + x._count._all, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">AI 总览</h1>
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200">
            👑 老板专属
          </span>
        </div>
        <Link href="/employees" className="text-xs text-violet-700 hover:underline">
          → AI 员工档案管理
        </Link>
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

      {/* 2. 暂停员工 + 解锁审批 */}
      {pausedEmployees.length > 0 && (
        <section className="mb-6">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-rose-700">
              ⏸ 暂停中的员工（{pausedEmployees.length}）
            </h2>
            <span className="text-[11px] text-slate-400">
              撞顶自动暂停 · 仅老板可解锁
            </span>
          </div>
          <ul className="space-y-1.5 overflow-hidden rounded-xl border border-rose-200 bg-rose-50/30">
            {pausedEmployees.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-rose-100 px-4 py-2.5 text-sm last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-slate-800">{e.name}</span>
                    <span className="text-xs text-slate-500">{e.role}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px] text-rose-700">
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
                </div>
                <UnpauseButton
                  employeeId={e.id}
                  name={e.name}
                  reason={e.pauseReason}
                />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-slate-500">
            💡 撞顶根因通常是日额度太低。建议先去{' '}
            <Link href="/employees" className="text-rose-700 hover:underline">
              /employees
            </Link>{' '}
            上调该员工额度，再回来解锁 — 否则 AI 短时间内又会撞顶。
          </p>
        </section>
      )}

      {/* 3. 今日 Top 员工 + 模型分布 */}
      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopEmployeesCard rows={topEmployees} todayBudget={dailyBudget} />
        <ModelBreakdownCard rows={modelBreakdown} todaySpend={todaySpend} />
      </section>

      {/* 4. AI 员工概览块 */}
      <EmployeesOverview
        totalEmployees={totalEmployees}
        activeEmployees={activeEmployees}
        supervisorCount={supervisorCount}
        pausedCount={pausedEmployees.length}
        recent={recentEmployees.map((e) => ({
          id: e.id,
          name: e.name,
          role: e.role,
          deptSlug: e.deptSlug,
          paused: e.paused,
          lastActiveAt: e.lastActiveAt?.toISOString() ?? null,
          dailyLimitHkd: Number(e.dailyLimitHkd),
        }))}
      />

      {/* 空状态指引 */}
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

      {/* 5. 历史范围 + 趋势图 + 每日明细 */}
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
                  <div className="h-full bg-violet-500" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EmployeesOverview({
  totalEmployees,
  activeEmployees,
  supervisorCount,
  pausedCount,
  recent,
}: {
  totalEmployees: number;
  activeEmployees: number;
  supervisorCount: number;
  pausedCount: number;
  recent: {
    id: string;
    name: string;
    role: string;
    deptSlug: string | null;
    paused: boolean;
    lastActiveAt: string | null;
    dailyLimitHkd: number;
  }[];
}) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          AI 员工概览
        </h2>
        <Link href="/employees" className="text-[11px] text-violet-700 hover:underline">
          管理 / 新建 / 编辑 →
        </Link>
      </div>

      {/* 4 KPI 微卡 */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <MiniKpi label="员工总数" value={totalEmployees} accent="violet" />
        <MiniKpi label="在用" value={activeEmployees} accent="emerald" />
        <MiniKpi label="上司" value={supervisorCount} accent="amber" />
        <MiniKpi
          label="暂停中"
          value={pausedCount}
          accent={pausedCount > 0 ? 'rose' : 'slate'}
        />
      </div>

      {/* 最近活跃 6 个 */}
      {totalEmployees === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-6 py-6 text-center text-sm text-slate-500">
          还没建过 AI 员工档案。
          <Link href="/employees" className="ml-2 text-violet-700 hover:underline">
            去 /employees 新建 →
          </Link>
        </div>
      ) : recent.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-6 py-6 text-center text-sm text-slate-500">
          员工建好了但还没有活跃记录 — 等 AI 调一次 /api/v1/token-usage。
        </div>
      ) : (
        <div>
          <div className="mb-2 text-[11px] text-slate-500">最近活跃</div>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((e) => (
              <li
                key={e.id}
                className="flex items-baseline justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <LiveDot lastActiveAt={e.lastActiveAt} paused={e.paused} />
                    <span className="truncate font-medium text-slate-800">{e.name}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-slate-500">
                    {e.role}
                    {e.deptSlug && <span> · {e.deptSlug}</span>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[10px] text-slate-400">
                    {e.lastActiveAt ? formatTimeAgo(e.lastActiveAt) : '从未'}
                  </div>
                  <div className="font-mono text-[10px] tabular-nums text-slate-500">
                    HKD {e.dailyLimitHkd}/d
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function MiniKpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: 'violet' | 'emerald' | 'amber' | 'rose' | 'slate';
}) {
  const map: Record<typeof accent, string> = {
    violet: 'from-violet-50 to-violet-100/40 ring-violet-200/60 text-violet-700',
    emerald: 'from-emerald-50 to-emerald-100/40 ring-emerald-200/60 text-emerald-700',
    amber: 'from-amber-50 to-amber-100/40 ring-amber-200/60 text-amber-700',
    rose: 'from-rose-50 to-rose-100/40 ring-rose-200/60 text-rose-700',
    slate: 'from-slate-50 to-slate-100/40 ring-slate-200/60 text-slate-700',
  };
  return (
    <div className={`rounded-xl bg-gradient-to-br p-3 ring-1 ${map[accent]}`}>
      <div className="text-[10px] font-medium uppercase tracking-[0.16em] opacity-80">
        {label}
      </div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function LiveDot({
  lastActiveAt,
  paused,
}: {
  lastActiveAt: string | null;
  paused: boolean;
}) {
  if (paused) return <span className="inline-block h-2 w-2 rounded-full bg-rose-500" title="暂停" />;
  if (!lastActiveAt)
    return <span className="inline-block h-2 w-2 rounded-full bg-slate-300" title="从未活跃" />;
  const ms = Date.now() - new Date(lastActiveAt).getTime();
  if (ms < 5 * 60_000)
    return (
      <span
        className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500"
        title="在跑（< 5 min）"
      />
    );
  if (ms < 30 * 60_000)
    return <span className="inline-block h-2 w-2 rounded-full bg-amber-400" title="待命（< 30 min）" />;
  return <span className="inline-block h-2 w-2 rounded-full bg-slate-300" title="离线" />;
}

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return '刚刚';
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)} 分前`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)} 时前`;
  if (ms < 7 * 86400_000) return `${Math.floor(ms / 86400_000)} 天前`;
  return d.toISOString().slice(0, 10);
}
