/**
 * 财务 / 运营 报告综合页 (/finance/reports)
 *
 * 5 个 Tab，每个对应一类报告：
 *   月报 (financial-monthly) · 财务季报 · 财务年报 · 运营季度 · 运营年度
 *
 * 数据：vault-client.listVaultReports(category) 拉 lty-vault repo
 *   raw/财务部/<dir>/ 目录下 markdown 文件，按 key 倒序。
 *
 * 看板侧只读 —— 文件由 cron 写。如果某 Tab 空，提示老板对应 cron 还没跑。
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireFinanceView } from '@/lib/finance-access';
import {
  listVaultReports,
  REPORT_CATEGORY_META,
  type ReportCategory,
  type ReportEntry,
} from '@/lib/vault-client';

export const dynamic = 'force-dynamic';

const TAB_ORDER: ReportCategory[] = [
  'financial-monthly',
  'financial-quarterly',
  'financial-annual',
  'ops-quarterly',
  'ops-annual',
];

const TAB_DISPLAY: Record<ReportCategory, { short: string; emoji: string; accent: string }> = {
  'financial-monthly': { short: '月报', emoji: '📅', accent: 'border-amber-500 text-amber-800 sm:bg-amber-50' },
  'financial-quarterly': { short: '财务季报', emoji: '📊', accent: 'border-rose-500 text-rose-800 sm:bg-rose-50' },
  'financial-annual': { short: '财务年报', emoji: '📈', accent: 'border-emerald-500 text-emerald-800 sm:bg-emerald-50' },
  'ops-quarterly': { short: '运营季度', emoji: '🔍', accent: 'border-violet-500 text-violet-800 sm:bg-violet-50' },
  'ops-annual': { short: '运营年度', emoji: '🌐', accent: 'border-sky-500 text-sky-800 sm:bg-sky-50' },
};

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfNextMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  await requireFinanceView();
  const sp = await searchParams;
  const requested = sp.cat ?? 'financial-monthly';
  const category: ReportCategory = TAB_ORDER.includes(requested as ReportCategory)
    ? (requested as ReportCategory)
    : 'financial-monthly';

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = startOfNextMonth(now);
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // 并行：当前 Tab 的列表 + 5 个 Tab 的 count（让 Tab 角标显示）+ 当月摘要
  const [allCounts, currentList, voucherCount, postedAggByCurrency, pendingDecisions] = await Promise.all([
    Promise.all(
      TAB_ORDER.map(async (c) => ({
        category: c,
        count: (await listVaultReports(c)).length,
      })),
    ),
    listVaultReports(category),
    prisma.voucher.count({ where: { date: { gte: monthStart, lt: monthEnd } } }),
    prisma.voucher.groupBy({
      by: ['currency'],
      where: { date: { gte: monthStart, lt: monthEnd }, status: 'POSTED' },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    Promise.all([
      prisma.voucher.count({ where: { status: 'AI_DRAFT' } }),
      prisma.approvalInstance.count({ where: { status: 'IN_PROGRESS' } }),
    ]).then(([d, a]) => d + a),
  ]);
  const countMap = Object.fromEntries(allCounts.map((x) => [x.category, x.count]));
  const meta = REPORT_CATEGORY_META[category];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Link href="/finance" className="text-sm text-slate-500 hover:text-slate-800">
            ← 返回财务
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">财务报告</h1>
          <p className="mt-1 text-xs text-slate-500">
            cron 自动生成 · markdown 来自 lty-vault repo
          </p>
        </div>
      </div>

      {/* 当月摘要 */}
      <section className="mb-5 rounded-xl border border-amber-200/60 bg-gradient-to-br from-amber-50 to-amber-100/40 p-4 ring-1 ring-amber-200/60">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-900">本月摘要 · {ym}</h2>
          <span className="text-[11px] text-amber-800/70">{now.toLocaleDateString('zh-CN')}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <SummaryStat label="本月凭证" value={voucherCount} unit="张" />
          <SummaryStat
            label="本月已过账"
            value={postedAggByCurrency.reduce((s, g) => s + g._count._all, 0)}
            unit="张"
          />
          <SummaryStat label="待决策项" value={pendingDecisions} unit="项" tone="rose" hint="AI 草稿 + 审批" />
          <SummaryStat label="本类报告" value={countMap[category] ?? 0} unit="份" />
        </div>
        {postedAggByCurrency.length > 0 && (
          <div className="mt-3 border-t border-amber-200/60 pt-3">
            <div className="mb-1 text-[11px] uppercase tracking-wider text-amber-900/80">本月已过账金额（按币种）</div>
            <div className="flex flex-wrap gap-2">
              {postedAggByCurrency.map((g) => (
                <span
                  key={g.currency}
                  className="rounded-md bg-white/70 px-2.5 py-1 text-xs font-mono tabular-nums ring-1 ring-amber-200/60"
                >
                  {g._sum.amount?.toString() ?? '0'} <span className="text-amber-800/70">{g.currency}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Tabs */}
      <nav
        role="tablist"
        className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:rounded-xl sm:border sm:bg-white sm:px-1.5 sm:py-1"
      >
        {TAB_ORDER.map((c) => {
          const active = category === c;
          const display = TAB_DISPLAY[c];
          const count = countMap[c] ?? 0;
          return (
            <Link
              key={c}
              href={`/finance/reports?cat=${c}`}
              role="tab"
              aria-selected={active}
              scroll={false}
              className={`relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition sm:rounded-lg sm:border-b-0 sm:py-1.5 ${
                active ? display.accent : 'border-transparent text-slate-500 hover:text-slate-800 sm:hover:bg-slate-50'
              }`}
            >
              <span>{display.emoji} {display.short}</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0 text-[10px] font-mono text-slate-600">{count}</span>
            </Link>
          );
        })}
      </nav>

      {/* 列表 */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
          {meta.label}（{currentList.length}）
        </h2>
        {currentList.length === 0 ? (
          <EmptyHint category={category} />
        ) : (
          <ul className="space-y-2">
            {currentList.map((r) => (
              <ReportRow key={r.sha} entry={r} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ReportRow({ entry }: { entry: ReportEntry }) {
  return (
    <li>
      <Link
        href={`/finance/reports/${entry.category}/${entry.key}`}
        className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-amber-300 hover:bg-amber-50/40"
      >
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm font-medium text-slate-800">{entry.key}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {entry.filename} · {(entry.size / 1024).toFixed(1)} KB
          </div>
        </div>
        <span className="text-slate-400">→</span>
      </Link>
    </li>
  );
}

function EmptyHint({ category }: { category: ReportCategory }) {
  const meta = REPORT_CATEGORY_META[category];
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center text-sm text-slate-400">
      <div>暂无{meta.label}。</div>
      <div className="mt-1 text-xs">
        cron 写入路径：
        <code className="ml-1 rounded bg-white px-1">{meta.dir}/&lt;key&gt;.md</code>
      </div>
      <div className="mt-1 text-xs">
        如果该跑了还没生成 → 检查 Vercel env <code className="rounded bg-white px-1">VAULT_GITHUB_TOKEN</code>
        或对应 cron 状态
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  unit,
  hint,
  tone,
}: {
  label: string;
  value: number;
  unit: string;
  hint?: string;
  tone?: 'rose';
}) {
  return (
    <div className="rounded-lg bg-white/60 p-3 ring-1 ring-amber-200/60">
      <div className="text-[10px] uppercase tracking-wider text-amber-900/70">{label}</div>
      <div
        className={`mt-0.5 text-2xl font-semibold tabular-nums ${
          tone === 'rose' && value > 0 ? 'text-rose-700' : 'text-amber-900'
        }`}
      >
        {value} <span className="text-xs font-normal opacity-70">{unit}</span>
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-amber-900/60">{hint}</div>}
    </div>
  );
}
