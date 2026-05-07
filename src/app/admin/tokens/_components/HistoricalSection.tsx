/**
 * 历史范围 + 趋势图 + 每日明细 — Step 3
 *
 * Server component（不带 use client），按 URL ?range= 拉数据，让范围切换
 * 走 Next.js Link 而不是 client setState — 整页重新 SSR 一遍最简单。
 *
 * 三大块：
 *   1. 范围切换 pill (今日/7d/30d/月/年) + 4 KPI 卡 (总花费/调用/日均/天数)
 *   2. 纯 CSS 柱状趋势图（每日花费），hover 显示日期/花费/调用数
 *   3. 范围内 Top 员工 + 模型分布（带 input/output token 总量）
 *   4. 每日明细折叠表（默认折叠，展开 max-h 滚动）
 *
 * 数据真实性铁律：实时从 prisma 聚合，不缓存。
 */
import Link from 'next/link';
import {
  dateRangeBoundaries,
  spendByRange,
  callCountByRange,
  topEmployeesByRange,
  modelBreakdownByRange,
  dailySpendSeries,
  type RangeKey,
} from '@/lib/budget';

const ALL_RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: '7d', label: '近 7 日' },
  { key: '30d', label: '近 30 日' },
  { key: 'month', label: '本月' },
  { key: 'year', label: '本年' },
];

export async function HistoricalSection({ range }: { range: RangeKey }) {
  const { start, end, days, label } = dateRangeBoundaries(range);

  const [spend, calls, top, models, series] = await Promise.all([
    spendByRange(start, end),
    callCountByRange(start, end),
    topEmployeesByRange(start, end, 10),
    modelBreakdownByRange(start, end),
    dailySpendSeries(start, end),
  ]);

  const dailyAvg = days > 0 ? spend / days : 0;
  const maxDaily = series.reduce((m, p) => Math.max(m, p.spendHkd), 0);
  // 让低值还能看到 → 至少 1 px 高
  const minVisibleHeightPct = 2;

  return (
    <section className="mt-8 space-y-6">
      {/* 范围切换 pill + 标题 */}
      <div>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 className="text-base font-semibold text-slate-900">
            历史 / 周期统计 · <span className="text-violet-700">{label}</span>
          </h2>
          <span className="text-[11px] text-slate-400">实时 · 不缓存</span>
        </div>
        <RangePills current={range} />
      </div>

      {/* 4 KPI 卡 */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <KpiCard
          label="周期总花费"
          value={`HKD ${spend.toLocaleString('zh-HK', { maximumFractionDigits: 2 })}`}
          accent="violet"
        />
        <KpiCard
          label="调用次数"
          value={calls.toLocaleString('zh-HK')}
          accent="sky"
        />
        <KpiCard
          label="日均"
          value={`HKD ${dailyAvg.toLocaleString('zh-HK', { maximumFractionDigits: 2 })}`}
          accent="emerald"
        />
        <KpiCard
          label="日期跨度"
          value={`${days} 天`}
          hint={`${formatHkDate(start)} → ${formatHkDate(new Date(end.getTime() - 1))}`}
          accent="slate"
        />
      </section>

      {/* 纯 CSS 趋势图 */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
          每日花费趋势
        </h3>
        {series.every((p) => p.spendHkd === 0) ? (
          <div className="py-12 text-center text-sm text-slate-400">
            本周期 0 调用 — 等 AI 员工开始上报
          </div>
        ) : (
          <BarChart series={series} maxDaily={maxDaily} minVisibleHeightPct={minVisibleHeightPct} />
        )}
      </section>

      {/* Top 员工 + 模型分布 */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RangeTopEmployees rows={top} totalSpend={spend} />
        <RangeModelBreakdown rows={models} totalSpend={spend} />
      </section>

      {/* 每日明细折叠表 */}
      <DailyDetailTable series={series} />
    </section>
  );
}

// ============ 子组件 ============

function RangePills({ current }: { current: RangeKey }) {
  return (
    <nav
      role="tablist"
      aria-label="时间范围"
      className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1"
    >
      {ALL_RANGES.map((r) => {
        const active = current === r.key;
        const href = r.key === 'today' ? '/admin/tokens' : `/admin/tokens?range=${r.key}`;
        return (
          <Link
            key={r.key}
            href={href}
            scroll={false}
            role="tab"
            aria-selected={active}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              active
                ? 'bg-violet-100 text-violet-900 shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {r.label}
          </Link>
        );
      })}
    </nav>
  );
}

type Accent = 'violet' | 'sky' | 'emerald' | 'slate' | 'rose' | 'amber';

function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent: Accent;
}) {
  const map: Record<Accent, string> = {
    violet: 'from-violet-50 to-violet-100/40 ring-violet-200/60 text-violet-700',
    sky: 'from-sky-50 to-sky-100/40 ring-sky-200/60 text-sky-700',
    emerald: 'from-emerald-50 to-emerald-100/40 ring-emerald-200/60 text-emerald-700',
    slate: 'from-slate-50 to-slate-100/40 ring-slate-200/60 text-slate-700',
    rose: 'from-rose-50 to-rose-100/40 ring-rose-200/60 text-rose-700',
    amber: 'from-amber-50 to-amber-100/40 ring-amber-200/60 text-amber-700',
  };
  return (
    <div className={`rounded-xl bg-gradient-to-br p-3 ring-1 sm:p-4 ${map[accent]}`}>
      <div className="text-[10px] font-medium uppercase tracking-[0.16em] opacity-80 sm:text-xs">
        {label}
      </div>
      <div className="mt-0.5 truncate font-mono text-lg font-semibold tabular-nums sm:text-xl">
        {value}
      </div>
      {hint && <div className="mt-0.5 truncate text-[10px] opacity-70">{hint}</div>}
    </div>
  );
}

function BarChart({
  series,
  maxDaily,
  minVisibleHeightPct,
}: {
  series: { date: string; spendHkd: number; callCount: number }[];
  maxDaily: number;
  minVisibleHeightPct: number;
}) {
  // 数据点超过 60 天时让条变窄 — 365 天还能塞下
  const barCount = series.length;
  // 高度刻度：取 max 上取整到 "好看的整数"
  const yMax = niceYMax(maxDaily);

  return (
    <div className="overflow-x-auto">
      <div className="relative" style={{ minWidth: Math.max(280, barCount * 8) }}>
        {/* y 轴刻度（左侧 4 段） */}
        <div className="absolute left-0 top-0 flex h-44 w-12 flex-col justify-between text-right text-[10px] text-slate-400">
          <span>{yMax.toFixed(yMax < 10 ? 2 : 0)}</span>
          <span>{(yMax * 0.66).toFixed(yMax < 10 ? 2 : 0)}</span>
          <span>{(yMax * 0.33).toFixed(yMax < 10 ? 2 : 0)}</span>
          <span>0</span>
        </div>
        {/* 柱条区 */}
        <div className="ml-14 flex h-44 items-end gap-px border-l border-b border-slate-200">
          {series.map((p) => {
            const heightPct =
              p.spendHkd === 0
                ? 0
                : Math.max(minVisibleHeightPct, (p.spendHkd / yMax) * 100);
            return (
              <div
                key={p.date}
                className="group relative flex flex-1 flex-col items-stretch justify-end"
                style={{ minWidth: 4 }}
              >
                {/* 柱条 */}
                <div
                  className={`transition-colors ${
                    p.spendHkd > 0
                      ? 'bg-violet-500 hover:bg-violet-700'
                      : 'bg-slate-100'
                  }`}
                  style={{ height: `${heightPct}%` }}
                  title={`${p.date} · HKD ${p.spendHkd.toFixed(2)} · ${p.callCount} 次`}
                />
                {/* hover tooltip — pure CSS group */}
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 w-max -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-[10px] text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                  <div className="font-mono">{p.date}</div>
                  <div className="font-mono tabular-nums">HKD {p.spendHkd.toFixed(2)}</div>
                  <div className="text-slate-300">{p.callCount} 次调用</div>
                </div>
              </div>
            );
          })}
        </div>
        {/* x 轴 — 仅 ≤14 天时给每日标签；多了只标首末 */}
        <div className="ml-14 mt-1 flex justify-between text-[9px] text-slate-400">
          {barCount <= 14 ? (
            series.map((p) => (
              <span key={p.date} className="flex-1 text-center">
                {p.date.slice(5)}
              </span>
            ))
          ) : (
            <>
              <span>{series[0]?.date.slice(5) ?? ''}</span>
              {barCount > 30 && (
                <span>{series[Math.floor(barCount / 2)]?.date.slice(5) ?? ''}</span>
              )}
              <span>{series[series.length - 1]?.date.slice(5) ?? ''}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RangeTopEmployees({
  rows,
  totalSpend,
}: {
  rows: Awaited<ReturnType<typeof topEmployeesByRange>>;
  totalSpend: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
        范围内 Top 10 员工
      </h3>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">本周期无调用</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const pct = totalSpend > 0 ? (r.spendHkd / totalSpend) * 100 : 0;
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
                  <span>{pct.toFixed(1)}% 周期</span>
                </div>
                <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-rose-500" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RangeModelBreakdown({
  rows,
  totalSpend,
}: {
  rows: Awaited<ReturnType<typeof modelBreakdownByRange>>;
  totalSpend: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
        范围内模型分布
      </h3>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">本周期无调用</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const pct = totalSpend > 0 ? (r.spendHkd / totalSpend) * 100 : 0;
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

/** 每日明细折叠表 — 用 <details> 原生折叠，无 client 状态 */
function DailyDetailTable({
  series,
}: {
  series: { date: string; spendHkd: number; callCount: number }[];
}) {
  return (
    <details className="rounded-xl border border-slate-200 bg-white">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        📋 每日明细（点击展开 · {series.length} 天）
      </summary>
      <div className="max-h-96 overflow-y-auto border-t border-slate-100">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left">日期</th>
              <th className="px-4 py-2 text-right">花费 HKD</th>
              <th className="px-4 py-2 text-right">调用次数</th>
              <th className="px-4 py-2 text-right">单次均价</th>
            </tr>
          </thead>
          <tbody>
            {series.map((p) => {
              const avg = p.callCount > 0 ? p.spendHkd / p.callCount : 0;
              return (
                <tr
                  key={p.date}
                  className={`border-t border-slate-100 ${p.spendHkd === 0 ? 'text-slate-400' : ''}`}
                >
                  <td className="px-4 py-1.5 font-mono text-xs">{p.date}</td>
                  <td className="px-4 py-1.5 text-right font-mono tabular-nums">
                    {p.spendHkd === 0 ? '—' : p.spendHkd.toFixed(2)}
                  </td>
                  <td className="px-4 py-1.5 text-right font-mono tabular-nums">
                    {p.callCount === 0 ? '—' : p.callCount.toLocaleString('zh-HK')}
                  </td>
                  <td className="px-4 py-1.5 text-right font-mono tabular-nums text-slate-500">
                    {avg === 0 ? '—' : avg.toFixed(4)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ============ helpers ============

/** 把 max 值上取到一个"好看"的刻度，避免 y 轴顶上写 47.62 这种 */
function niceYMax(v: number): number {
  if (v <= 0) return 1;
  // 取上整到 1/2/5 × 10^n
  const log = Math.floor(Math.log10(v));
  const base = Math.pow(10, log);
  const norm = v / base;
  let step: number;
  if (norm <= 1) step = 1;
  else if (norm <= 2) step = 2;
  else if (norm <= 5) step = 5;
  else step = 10;
  return step * base;
}

function formatHkDate(d: Date): string {
  const HK_OFFSET_MS = 8 * 60 * 60 * 1000;
  const hk = new Date(d.getTime() + HK_OFFSET_MS);
  return hk.toISOString().slice(0, 10);
}
