/**
 * 财务月报列表 (/finance/monthly-reports)
 *
 * 拉 lty-vault repo 的 raw/财务部/monthly_reports/ 目录，按月倒序展示。
 * 顶部"本月摘要"卡聚合当月凭证 / 收支 / 待决策项，给老板每月扫一眼用。
 *
 * 月报由 cron 定期生成（A3 已上线），看板纯 read。
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireFinanceView } from '@/lib/finance-access';
import { listMonthlyReports } from '@/lib/vault-client';

export const dynamic = 'force-dynamic';

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfNextMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export default async function MonthlyReportsPage() {
  await requireFinanceView();

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = startOfNextMonth(now);
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [reports, voucherCount, postedAggByCurrency, pendingDecisions] = await Promise.all([
    listMonthlyReports(),
    prisma.voucher.count({
      where: { date: { gte: monthStart, lt: monthEnd } },
    }),
    // 按 currency 分组合计 amount（POSTED only —— 真实账目）
    prisma.voucher.groupBy({
      by: ['currency'],
      where: { date: { gte: monthStart, lt: monthEnd }, status: 'POSTED' },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    // 待决策 = AI_DRAFT 凭证 + IN_PROGRESS 审批
    Promise.all([
      prisma.voucher.count({ where: { status: 'AI_DRAFT' } }),
      prisma.approvalInstance.count({ where: { status: 'IN_PROGRESS' } }),
    ]).then(([d, a]) => d + a),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Link href="/finance" className="text-sm text-slate-500 hover:text-slate-800">
            ← 返回财务
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">月报</h1>
          <p className="mt-1 text-xs text-slate-500">cron 自动生成 · 来自 lty-vault repo</p>
        </div>
      </div>

      {/* 本月摘要 */}
      <section className="mb-6 rounded-xl border border-amber-200/60 bg-gradient-to-br from-amber-50 to-amber-100/40 p-4 ring-1 ring-amber-200/60">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-900">本月摘要 · {ym}</h2>
          <span className="text-[11px] text-amber-800/70">{now.toLocaleDateString('zh-CN')}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <SummaryStat label="本月凭证" value={voucherCount} unit="张" />
          <SummaryStat label="本月已过账" value={postedAggByCurrency.reduce((s, g) => s + g._count._all, 0)} unit="张" />
          <SummaryStat label="待决策项" value={pendingDecisions} unit="项" hint="AI 草稿 + 在审审批" tone="rose" />
          <SummaryStat label="历史月报" value={reports.length} unit="份" />
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

      {/* 月报列表 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
          全部月报（{reports.length}）
        </h2>
        {reports.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center text-sm text-slate-400">
            还没生成过月报。
            <div className="mt-1 text-xs">
              cron 每月 1 号生成上月报告 → 落 <code className="rounded bg-white px-1">raw/财务部/monthly_reports/YYYY-MM.md</code>
            </div>
            <div className="mt-1 text-xs">
              如果该跑了还没生成 → 检查 <code className="rounded bg-white px-1">VAULT_GITHUB_TOKEN</code> 是否配在 Vercel env
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {reports.map((r) => (
              <li key={r.sha}>
                <Link
                  href={`/finance/monthly-reports/${r.yearMonth}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-amber-300 hover:bg-amber-50/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm font-medium text-slate-800">{r.yearMonth}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {r.filename} · {(r.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <span className="text-slate-400">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
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
      <div className={`mt-0.5 text-2xl font-semibold tabular-nums ${tone === 'rose' && value > 0 ? 'text-rose-700' : 'text-amber-900'}`}>
        {value} <span className="text-xs font-normal opacity-70">{unit}</span>
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-amber-900/60">{hint}</div>}
    </div>
  );
}
