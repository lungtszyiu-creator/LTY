/**
 * 汇率列表 + 趋势图 (/finance/fx-rates)
 *
 * 顶部：最近 30 天 USDT/HKD MSO vs 中间价双折线 + 偏离 % 柱状图（client island）
 * 下方：fx_rates 全表最近 100 条（pair / date / source / rate / isOfficial）
 *
 * 中间价定义：同 date 同 pair 下，第一个非 MSO source（如 COINGECKO/HKMA/BINANCE）
 *   作为中间价。如果有多个非 MSO source 取首个出现的（看 cron 跑哪个先）。
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireFinanceView } from '@/lib/finance-access';
import { FxRateCharts, type FxChartPoint } from './_components/FxRateCharts';

export const dynamic = 'force-dynamic';

const CHART_PAIR = 'USDT/HKD';

function daysAgo(d: number): Date {
  const t = new Date();
  t.setDate(t.getDate() - d);
  t.setHours(0, 0, 0, 0);
  return t;
}

const SOURCE_META: Record<string, { label: string; cls: string }> = {
  MSO: { label: 'MSO', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  COINGECKO: { label: 'CoinGecko', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  HKMA: { label: 'HKMA', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  OKX: { label: 'OKX', cls: 'bg-violet-50 text-violet-700 ring-violet-200' },
  BINANCE: { label: 'Binance', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
};

export default async function FxRatesPage() {
  await requireFinanceView();

  const thirtyDaysAgo = daysAgo(30);

  const [chartRows, recentRows] = await Promise.all([
    prisma.fxRate.findMany({
      where: { pair: CHART_PAIR, date: { gte: thirtyDaysAgo } },
      orderBy: { date: 'asc' },
      select: { date: true, source: true, rate: true },
    }),
    prisma.fxRate.findMany({
      orderBy: { date: 'desc' },
      take: 100,
      select: {
        id: true,
        date: true,
        pair: true,
        rate: true,
        source: true,
        isOfficial: true,
        createdByAi: true,
        notes: true,
      },
    }),
  ]);

  // 30 天每日聚合：MSO vs 中间价
  const byDate = new Map<string, { mso?: number; mid?: number }>();
  for (const r of chartRows) {
    const day = r.date.toISOString().slice(0, 10);
    if (!byDate.has(day)) byDate.set(day, {});
    const slot = byDate.get(day)!;
    const rateNum = Number(r.rate);
    if (r.source === 'MSO') {
      slot.mso = rateNum;
    } else if (slot.mid === undefined) {
      // 首个非 MSO source 作中间价
      slot.mid = rateNum;
    }
  }
  const chartData: FxChartPoint[] = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date: date.slice(5),
      mso: v.mso ?? null,
      mid: v.mid ?? null,
      deviationPct:
        v.mso !== undefined && v.mid !== undefined && v.mid !== 0
          ? ((v.mso - v.mid) / v.mid) * 100
          : null,
    }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Link href="/finance" className="text-sm text-slate-500 hover:text-slate-800">
            ← 返回财务
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">汇率</h1>
          <p className="mt-1 text-xs text-slate-500">cron 每日拉 MSO + CoinGecko + HKMA + OKX/Binance</p>
        </div>
      </div>

      {/* 趋势图 */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
          {CHART_PAIR} · 最近 30 天趋势
        </h2>
        <FxRateCharts data={chartData} pair={CHART_PAIR} />
      </section>

      {/* 列表 */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
          全部记录（最近 100 条）
        </h2>
        {recentRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center text-sm text-slate-400">
            还没记录。等 cron 跑出第一条 fx 数据。
          </div>
        ) : (
          <>
            {/* Mobile：卡片堆 */}
            <ul className="space-y-2 md:hidden">
              {recentRows.map((r) => {
                const sm = SOURCE_META[r.source] ?? { label: r.source, cls: 'bg-slate-50 text-slate-600 ring-slate-200' };
                return (
                  <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="font-medium text-slate-800">{r.pair}</div>
                      <div className="font-mono tabular-nums text-slate-900">{Number(r.rate).toFixed(6)}</div>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="tabular-nums">{r.date.toISOString().slice(0, 10)}</span>
                      <span className="flex items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${sm.cls}`}>
                          {sm.label}
                        </span>
                        {r.isOfficial && <span className="text-[10px] text-emerald-700">✓ 官方</span>}
                      </span>
                    </div>
                    {r.createdByAi && (
                      <div className="mt-1 text-[10px] text-slate-400">🤖 {r.createdByAi}</div>
                    )}
                  </li>
                );
              })}
            </ul>
            {/* Desktop：table-fixed + 长「来源说明」truncate 防把右栏推出去 */}
            <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-[110px]" />{/* 日期 */}
                  <col className="w-[110px]" />{/* 币对 */}
                  <col className="w-[100px]" />{/* 来源 */}
                  <col className="w-[140px]" />{/* 汇率 */}
                  <col className="w-[80px]" />{/* 官方 */}
                  <col />{/* 来源说明 — 撑剩余 */}
                </colgroup>
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">日期</th>
                    <th className="px-3 py-2 text-left">币对</th>
                    <th className="px-3 py-2 text-left">来源</th>
                    <th className="px-3 py-2 text-right">汇率</th>
                    <th className="px-3 py-2 text-left">官方</th>
                    <th className="px-3 py-2 text-left">来源说明</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRows.map((r) => {
                    const sm = SOURCE_META[r.source] ?? { label: r.source, cls: 'bg-slate-50 text-slate-600 ring-slate-200' };
                    const noteText = r.createdByAi ? `🤖 ${r.createdByAi}` : r.notes ?? '—';
                    return (
                      <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/40">
                        <td className="px-3 py-2 align-top whitespace-nowrap text-xs text-slate-600 tabular-nums">
                          {r.date.toISOString().slice(0, 10)}
                        </td>
                        <td className="px-3 py-2 align-top truncate font-medium text-slate-800">{r.pair}</td>
                        <td className="px-3 py-2 align-top whitespace-nowrap">
                          <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${sm.cls}`}>
                            {sm.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top whitespace-nowrap text-right font-mono tabular-nums text-slate-900">
                          {Number(r.rate).toFixed(6)}
                        </td>
                        <td className="px-3 py-2 align-top whitespace-nowrap text-xs">
                          {r.isOfficial ? <span className="text-emerald-700">✓</span> : <span className="text-slate-300">—</span>}
                        </td>
                        <td
                          className="truncate px-3 py-2 align-top text-xs text-slate-500"
                          title={noteText}
                        >
                          {noteText}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
