/**
 * 实时对账试算 (/finance/preview)
 *
 * 老板/出纳随时点开就跑实时聚合，**不依赖 cron**。本月还在进行中也能预审。
 * 用途：月报 cron 跑出来之前发现错账，及时改；不用等到月底已经定型。
 *
 * 范围 tabs：本月 / 上月 / 本季度 / 本年度
 *
 * 展示：
 * - 收支汇总（按币种）
 * - 按科目细分（借方 + 贷方各自合计）—— 老板要的"一笔笔对"
 * - 凭证统计（POSTED / AI_DRAFT / VOIDED）
 * - 大额预警（>= 5000 等值）
 * - 三方对账状态
 *
 * 底部 CSV 导出按钮（按当前范围导出）。
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireFinanceView } from '@/lib/finance-access';

export const dynamic = 'force-dynamic';

type RangeKey = 'this-month' | 'last-month' | 'this-quarter' | 'this-year';

const RANGE_TABS: { key: RangeKey; label: string }[] = [
  { key: 'this-month', label: '本月' },
  { key: 'last-month', label: '上月' },
  { key: 'this-quarter', label: '本季度' },
  { key: 'this-year', label: '本年度' },
];

const LARGE_THRESHOLD = 5000;

function rangeFor(key: RangeKey): { start: Date; end: Date; label: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  if (key === 'this-month') {
    return {
      start: new Date(Date.UTC(y, m, 1)),
      end: new Date(Date.UTC(y, m + 1, 1)),
      label: `${y}-${String(m + 1).padStart(2, '0')}`,
    };
  }
  if (key === 'last-month') {
    const startThis = new Date(Date.UTC(y, m, 1));
    const startLast = new Date(Date.UTC(y, m - 1, 1));
    const lastMonthYM = `${startLast.getUTCFullYear()}-${String(startLast.getUTCMonth() + 1).padStart(2, '0')}`;
    return { start: startLast, end: startThis, label: lastMonthYM };
  }
  if (key === 'this-quarter') {
    const qStartMonth = Math.floor(m / 3) * 3;
    return {
      start: new Date(Date.UTC(y, qStartMonth, 1)),
      end: new Date(Date.UTC(y, qStartMonth + 3, 1)),
      label: `${y} Q${Math.floor(m / 3) + 1}`,
    };
  }
  // this-year
  return {
    start: new Date(Date.UTC(y, 0, 1)),
    end: new Date(Date.UTC(y + 1, 0, 1)),
    label: `${y} 年度`,
  };
}

type Totals = {
  vouchers: { count: number; postedCount: number; aiDraftCount: number; voidedCount: number };
  byCurrency: Record<string, { revenue: number; expense: number; net: number }>;
  byDebitAccount: Record<string, { count: number; total: number; currency: string }>;
  byCreditAccount: Record<string, { count: number; total: number; currency: string }>;
  largeTxs: Array<{ id: string; date: string; summary: string; amount: number; currency: string }>;
  chainTxs: { count: number };
  reconciliations: { count: number; openCount: number; resolvedCount: number };
};

async function aggregate(start: Date, end: Date, label: string): Promise<Totals> {
  const vouchers = await prisma.voucher.findMany({
    where: { date: { gte: start, lt: end } },
    select: {
      id: true, date: true, summary: true, debitAccount: true, creditAccount: true,
      amount: true, currency: true, status: true,
    },
  });

  const totals: Totals = {
    vouchers: { count: vouchers.length, postedCount: 0, aiDraftCount: 0, voidedCount: 0 },
    byCurrency: {},
    byDebitAccount: {},
    byCreditAccount: {},
    largeTxs: [],
    chainTxs: { count: 0 },
    reconciliations: { count: 0, openCount: 0, resolvedCount: 0 },
  };

  for (const v of vouchers) {
    if (v.status === 'POSTED') totals.vouchers.postedCount++;
    else if (v.status === 'AI_DRAFT') totals.vouchers.aiDraftCount++;
    else if (v.status === 'VOIDED') totals.vouchers.voidedCount++;
    if (v.status === 'VOIDED' || v.status === 'REJECTED') continue;

    const cur = v.currency.toUpperCase();
    if (!totals.byCurrency[cur]) totals.byCurrency[cur] = { revenue: 0, expense: 0, net: 0 };
    const amount = Number(v.amount);
    if (/主营业务收入|其他业务收入|营业外收入|利息收入/.test(v.creditAccount)) {
      totals.byCurrency[cur].revenue += amount;
    } else if (/管理费用|销售费用|财务费用|营业外支出/.test(v.debitAccount)) {
      totals.byCurrency[cur].expense += amount;
    }

    const dKey = `${v.debitAccount} (${cur})`;
    if (!totals.byDebitAccount[dKey]) {
      totals.byDebitAccount[dKey] = { count: 0, total: 0, currency: cur };
    }
    totals.byDebitAccount[dKey].count++;
    totals.byDebitAccount[dKey].total += amount;

    const cKey = `${v.creditAccount} (${cur})`;
    if (!totals.byCreditAccount[cKey]) {
      totals.byCreditAccount[cKey] = { count: 0, total: 0, currency: cur };
    }
    totals.byCreditAccount[cKey].count++;
    totals.byCreditAccount[cKey].total += amount;

    if (amount >= LARGE_THRESHOLD) {
      totals.largeTxs.push({
        id: v.id,
        date: v.date.toISOString().slice(0, 10),
        summary: v.summary,
        amount,
        currency: cur,
      });
    }
  }

  for (const cur of Object.keys(totals.byCurrency)) {
    const c = totals.byCurrency[cur];
    c.net = c.revenue - c.expense;
  }
  totals.largeTxs.sort((a, b) => b.amount - a.amount);
  totals.largeTxs = totals.largeTxs.slice(0, 20);

  totals.chainTxs.count = await prisma.chainTransaction.count({
    where: { timestamp: { gte: start, lt: end } },
  });

  // 对账（仅对应"本月"或具体月份的 reconciliation 才能匹配 period 字段）
  if (label.match(/^\d{4}-\d{2}$/)) {
    const recons = await prisma.reconciliation.findMany({
      where: { period: label },
      select: { status: true },
    });
    totals.reconciliations.count = recons.length;
    totals.reconciliations.openCount = recons.filter(
      (r) => r.status === 'OPEN' || r.status === 'ESCALATED',
    ).length;
    totals.reconciliations.resolvedCount = recons.filter((r) => r.status === 'RESOLVED').length;
  }

  return totals;
}

function fmt(n: number): string {
  if (Math.abs(n) >= 10000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return n.toFixed(2);
}

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireFinanceView();
  const sp = await searchParams;
  const range: RangeKey = (['this-month', 'last-month', 'this-quarter', 'this-year'] as const).includes(
    sp.range as never,
  )
    ? (sp.range as RangeKey)
    : 'this-month';

  const r = rangeFor(range);
  const totals = await aggregate(r.start, r.end, r.label);

  // CSV 导出 link
  const fromStr = r.start.toISOString().slice(0, 10);
  const toStrInclusive = new Date(r.end.getTime() - 1).toISOString().slice(0, 10);
  const exportHref = `/api/finance/vouchers/export?from=${fromStr}&to=${toStrInclusive}`;

  const debitSorted = Object.entries(totals.byDebitAccount).sort(([, a], [, b]) => b.total - a.total);
  const creditSorted = Object.entries(totals.byCreditAccount).sort(([, a], [, b]) => b.total - a.total);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5">
        <Link href="/finance" className="text-sm text-slate-500 hover:text-slate-800">
          ← 返回财务
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">实时对账试算</h1>
        <p className="mt-1 text-xs text-slate-500">
          实时聚合当下 DB 数据，不依赖 cron。月报跑出来之前可以随时预审，发现错账及时改。
          数据期间：<span className="font-mono">{fromStr} ~ {toStrInclusive}</span>
        </p>
      </div>

      {/* 范围 tabs */}
      <nav role="tablist" className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:rounded-xl sm:border sm:bg-white sm:px-1.5 sm:py-1">
        {RANGE_TABS.map((t) => {
          const active = range === t.key;
          return (
            <Link
              key={t.key}
              href={`/finance/preview?range=${t.key}`}
              role="tab"
              aria-selected={active}
              scroll={false}
              className={`relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition sm:rounded-lg sm:border-b-0 sm:py-1.5 ${
                active
                  ? 'border-rose-500 text-rose-700 sm:bg-rose-50 sm:text-rose-800'
                  : 'border-transparent text-slate-500 hover:text-slate-800 sm:hover:bg-slate-50'
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {/* 顶部 KPI */}
      <section className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Kpi label="凭证总数" value={totals.vouchers.count} accent="rose" />
        <Kpi label="已过账" value={totals.vouchers.postedCount} accent="emerald" />
        <Kpi label="待审 (草稿)" value={totals.vouchers.aiDraftCount} accent="amber" hint={totals.vouchers.aiDraftCount > 0 ? '⚠ 有未过账' : undefined} />
        <Kpi label="链上交易" value={totals.chainTxs.count} accent="sky" />
      </section>

      {/* 收支汇总 */}
      <Section title={`收支汇总（按币种 · ${r.label}）`}>
        {Object.keys(totals.byCurrency).length === 0 ? (
          <Empty text="本期间无凭证。" />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">币种</th>
                  <th className="px-4 py-2 text-right">收入</th>
                  <th className="px-4 py-2 text-right">支出</th>
                  <th className="px-4 py-2 text-right">净额</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(totals.byCurrency).sort().map(([cur, c]) => (
                  <tr key={cur} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-800">{cur}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-emerald-700">{fmt(c.revenue)}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-rose-700">{fmt(c.expense)}</td>
                    <td className={`px-4 py-2 text-right font-mono tabular-nums font-semibold ${c.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmt(c.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* 按科目细分 - 双栏 */}
      <Section title="按科目细分（一笔笔对账用）">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AccountTable title="借方科目" rows={debitSorted} />
          <AccountTable title="贷方科目" rows={creditSorted} />
        </div>
      </Section>

      {/* 大额预警 */}
      <Section title={`大额预警（单笔 ≥ ${LARGE_THRESHOLD} 等值）`}>
        {totals.largeTxs.length === 0 ? (
          <Empty text="本期间无大额凭证。" />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">日期</th>
                  <th className="px-4 py-2 text-left">摘要</th>
                  <th className="px-4 py-2 text-right">金额</th>
                </tr>
              </thead>
              <tbody>
                {totals.largeTxs.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100 hover:bg-amber-50/40">
                    <td className="px-4 py-2 whitespace-nowrap text-slate-600 tabular-nums">{t.date}</td>
                    <td className="px-4 py-2 text-slate-800">
                      <Link href={`/finance/vouchers/${t.id}`} className="hover:underline">
                        {t.summary}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {fmt(t.amount)} {t.currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* 三方对账（仅按月度时显示） */}
      {totals.reconciliations.count > 0 && (
        <Section title="三方对账状态">
          <div className="grid grid-cols-3 gap-3">
            <Kpi label="已跑批次" value={totals.reconciliations.count} accent="sky" />
            <Kpi label="已对平 (RESOLVED)" value={totals.reconciliations.resolvedCount} accent="emerald" />
            <Kpi label="待处理 (OPEN)" value={totals.reconciliations.openCount} accent={totals.reconciliations.openCount > 0 ? 'rose' : 'emerald'} />
          </div>
        </Section>
      )}

      {/* 操作栏 */}
      <section className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200/60 bg-amber-50/40 p-4">
        <span className="text-sm text-amber-900">导出 / 后续操作：</span>
        <a
          href={exportHref}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 transition hover:bg-amber-100/40"
        >
          ⤓ 导出本期 CSV
        </a>
        <Link
          href={`/finance/vouchers?range=${range === 'this-year' ? 'all' : range === 'this-quarter' ? '90d' : '30d'}`}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 transition hover:bg-amber-100/40"
        >
          看明细
        </Link>
        <Link
          href="/finance/reports"
          className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 transition hover:bg-amber-100/40"
        >
          月报 / 季报归档
        </Link>
      </section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-sm text-slate-400">
      {text}
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: number;
  accent: 'rose' | 'amber' | 'emerald' | 'sky';
  hint?: string;
}) {
  const map = {
    rose: 'from-rose-50 to-rose-100/40 ring-rose-200/60 text-rose-700',
    amber: 'from-amber-50 to-amber-100/40 ring-amber-200/60 text-amber-700',
    emerald: 'from-emerald-50 to-emerald-100/40 ring-emerald-200/60 text-emerald-700',
    sky: 'from-sky-50 to-sky-100/40 ring-sky-200/60 text-sky-700',
  } as const;
  return (
    <div className={`rounded-xl bg-gradient-to-br p-3 ring-1 sm:p-4 ${map[accent]}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider opacity-80 sm:text-xs">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums sm:mt-1 sm:text-3xl">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] opacity-80">{hint}</div>}
    </div>
  );
}

function AccountTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, { count: number; total: number; currency: string }]>;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">{title}</h3>
      {rows.length === 0 ? (
        <Empty text="无数据" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">科目</th>
                <th className="px-3 py-2 text-right">笔数</th>
                <th className="px-3 py-2 text-right">合计</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([key, v]) => (
                <tr key={key} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs text-slate-700">{key}</td>
                  <td className="px-3 py-2 text-right text-slate-600 tabular-nums">{v.count}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-slate-900">
                    {v.total.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
