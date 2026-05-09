/**
 * 财务总看板 (/finance/dashboard)
 *
 * 老板每天打开一眼看完公司财务状态。全部 server component 拉 prisma，
 * 唯一 client island 是 MsoDeviationChart（recharts）。
 *
 * 卡片：
 * 1. 本月收支（按币种分，POSTED voucher 当月）
 * 2. 待审批数 + 待复核 AI_DRAFT 凭证数
 * 3. 对账状态（OPEN / RESOLVED / ESCALATED）
 * 4. MSO 偏离趋势（最近 7 天 USDT/HKD：MSO vs 第一个非 MSO 中间价）
 * 5. 链上钱包余额（最近 4 周 WalletBalanceSnapshot 每钱包每 token 取最新）
 * 6. 大额预警（最近 7 天 amount >= 5000 等值的 voucher）
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireFinanceView } from '@/lib/finance-access';
import { MsoDeviationChart, type MsoDeviationPoint } from './_components/MsoDeviationChart';
import { shortenEthAddressesIn } from '@/lib/finance-format';

export const dynamic = 'force-dynamic';

const MSO_PAIR = 'USDT/HKD';
const LARGE_THRESHOLD = 5000;

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfNextMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}
function daysAgo(d: number): Date {
  const t = new Date();
  t.setDate(t.getDate() - d);
  t.setHours(0, 0, 0, 0);
  return t;
}

export default async function FinanceDashboardPage() {
  await requireFinanceView();

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = startOfNextMonth(now);
  const sevenDaysAgo = daysAgo(7);
  const fourWeeksAgo = daysAgo(28);

  const [
    voucherByCurrency,
    pendingApprovals,
    aiDraftVouchers,
    reconByStatus,
    fxRowsLast7d,
    snapshotsLast4w,
    largeVouchers,
  ] = await Promise.all([
    prisma.voucher.groupBy({
      by: ['currency', 'status'],
      where: { date: { gte: monthStart, lt: monthEnd } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.approvalInstance.count({ where: { status: 'IN_PROGRESS' } }),
    prisma.voucher.count({ where: { status: 'AI_DRAFT' } }),
    prisma.reconciliation.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.fxRate.findMany({
      where: { pair: MSO_PAIR, date: { gte: sevenDaysAgo } },
      orderBy: { date: 'asc' },
      select: { date: true, source: true, rate: true },
    }),
    prisma.walletBalanceSnapshot.findMany({
      where: { asOf: { gte: fourWeeksAgo } },
      orderBy: { asOf: 'desc' },
      include: { wallet: { select: { id: true, label: true, chain: true } } },
    }),
    prisma.voucher.findMany({
      where: {
        date: { gte: sevenDaysAgo },
        amount: { gte: LARGE_THRESHOLD },
      },
      orderBy: { date: 'desc' },
      take: 10,
      select: {
        id: true,
        date: true,
        summary: true,
        debitAccount: true,
        creditAccount: true,
        amount: true,
        currency: true,
        status: true,
      },
    }),
  ]);

  // 把 Voucher groupBy 转成"按币种 + 收支"的展示矩阵
  type CurrencyAgg = {
    currency: string;
    posted: number; // amount sum
    aiDraft: number; // count
    rejected: number;
    voided: number;
    totalCount: number;
  };
  const ccyMap = new Map<string, CurrencyAgg>();
  for (const g of voucherByCurrency) {
    const ccy = g.currency;
    let row = ccyMap.get(ccy);
    if (!row) {
      row = { currency: ccy, posted: 0, aiDraft: 0, rejected: 0, voided: 0, totalCount: 0 };
      ccyMap.set(ccy, row);
    }
    row.totalCount += g._count._all;
    if (g.status === 'POSTED') row.posted += Number(g._sum.amount ?? 0);
    if (g.status === 'AI_DRAFT') row.aiDraft += g._count._all;
    if (g.status === 'REJECTED') row.rejected += g._count._all;
    if (g.status === 'VOIDED') row.voided += g._count._all;
  }
  const currencies = Array.from(ccyMap.values()).sort((a, b) => b.posted - a.posted);

  // 对账状态
  const reconMap = Object.fromEntries(reconByStatus.map((r) => [r.status, r._count._all]));
  const reconOpen = reconMap.OPEN ?? 0;
  const reconResolved = reconMap.RESOLVED ?? 0;
  const reconEscalated = reconMap.ESCALATED ?? 0;

  // MSO 偏离趋势：同 date 同 pair 下 MSO rate + 第一个非 MSO source 当中间价
  const byDate = new Map<string, { mso?: number; mid?: number }>();
  for (const r of fxRowsLast7d) {
    const day = r.date.toISOString().slice(0, 10);
    if (!byDate.has(day)) byDate.set(day, {});
    const slot = byDate.get(day)!;
    const rateNum = Number(r.rate);
    if (r.source === 'MSO') {
      slot.mso = rateNum;
    } else if (slot.mid === undefined) {
      slot.mid = rateNum;
    }
  }
  const msoSeries: MsoDeviationPoint[] = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date: date.slice(5), // MM-DD 简洁
      mso: v.mso ?? null,
      mid: v.mid ?? null,
      deviationPct: v.mso !== undefined && v.mid !== undefined && v.mid !== 0
        ? ((v.mso - v.mid) / v.mid) * 100
        : null,
    }));

  // 钱包最新余额：每 (walletId, token) 取 asOf 最大那条
  type LatestKey = string;
  const latestSnap = new Map<
    LatestKey,
    {
      walletId: string;
      label: string;
      chain: string;
      token: string;
      amount: string;
      asOf: Date;
    }
  >();
  for (const s of snapshotsLast4w) {
    const key = `${s.walletId}:${s.token}`;
    if (!latestSnap.has(key)) {
      latestSnap.set(key, {
        walletId: s.walletId,
        label: s.wallet.label,
        chain: s.wallet.chain,
        token: s.token,
        amount: s.amount,
        asOf: s.asOf,
      });
    }
  }
  const wallets = Array.from(latestSnap.values()).sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Link href="/finance" className="text-sm text-slate-500 hover:text-slate-800">
            ← 返回财务
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">财务总看板</h1>
        </div>
        <span className="text-xs text-slate-400">
          实时 · {now.toLocaleString('zh-CN', { hour12: false })}
        </span>
      </div>

      {/* KPI 三连：待审批 / AI 草稿 / 大额预警 */}
      <section className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
        <KpiCard
          label="待审批"
          value={pendingApprovals}
          hint="ApprovalInstance IN_PROGRESS"
          accent={pendingApprovals > 0 ? 'amber' : 'slate'}
        />
        <KpiCard
          label="待复核凭证"
          value={aiDraftVouchers}
          hint="AI 草稿，老板点确认"
          accent={aiDraftVouchers > 0 ? 'rose' : 'slate'}
        />
        <KpiCard
          label="近 7 天大额"
          value={largeVouchers.length}
          hint={`amount ≥ ${LARGE_THRESHOLD}`}
          accent={largeVouchers.length > 0 ? 'rose' : 'slate'}
        />
      </section>

      {/* 本月收支（按币种）*/}
      <section className="mb-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">本月收支（按币种）</h2>
        {currencies.length === 0 ? (
          <EmptyHint text="本月暂无凭证。" />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">币种</th>
                  <th className="px-4 py-2 text-right">已过账金额</th>
                  <th className="px-4 py-2 text-right">总凭证</th>
                  <th className="px-4 py-2 text-right">待复核</th>
                  <th className="px-4 py-2 text-right">驳回 / 作废</th>
                </tr>
              </thead>
              <tbody>
                {currencies.map((c) => (
                  <tr key={c.currency} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-800">{c.currency}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-900">
                      {c.posted.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600">{c.totalCount}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {c.aiDraft > 0 ? <span className="text-rose-700">{c.aiDraft}</span> : <span className="text-slate-400">0</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                      {c.rejected + c.voided}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 对账状态 */}
      <section className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
        <KpiCard label="对账 · 待处理" value={reconOpen} accent={reconOpen > 0 ? 'rose' : 'emerald'} hint="OPEN" />
        <KpiCard label="对账 · 已解决" value={reconResolved} accent="emerald" hint="RESOLVED" />
        <KpiCard label="对账 · 升级" value={reconEscalated} accent={reconEscalated > 0 ? 'rose' : 'slate'} hint="ESCALATED" />
      </section>

      {/* MSO 偏离趋势 */}
      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            MSO 偏离趋势（{MSO_PAIR}，最近 7 天）
          </h2>
          <Link href="/finance/fx-rates" className="text-xs text-sky-700 hover:underline">
            完整汇率页 →
          </Link>
        </div>
        <MsoDeviationChart data={msoSeries} pair={MSO_PAIR} />
        {msoSeries.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {msoSeries
              .filter((p) => p.deviationPct !== null)
              .slice(-7)
              .map((p) => {
                const dev = p.deviationPct!;
                const tone = Math.abs(dev) > 0.3 ? 'text-rose-700' : 'text-emerald-700';
                return (
                  <span key={p.date} className={`rounded-md bg-slate-50 px-2 py-0.5 font-mono ${tone}`}>
                    {p.date}: {dev >= 0 ? '+' : ''}{dev.toFixed(3)}%
                  </span>
                );
              })}
          </div>
        )}
      </section>

      {/* 链上钱包余额 */}
      <section className="mb-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
          链上钱包余额（最近 4 周快照）
        </h2>
        {wallets.length === 0 ? (
          <EmptyHint text="暂无钱包快照。cron 每天 UTC 00:00（HK 8:00）跑。" />
        ) : (
          <ul className="space-y-2">
            {wallets.map((w) => (
              <li
                key={`${w.walletId}:${w.token}`}
                className="flex items-baseline justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5"
              >
                <div className="min-w-0">
                  <Link
                    href={`/finance/wallets/${w.walletId}`}
                    className="text-sm font-medium text-slate-800 hover:text-amber-700"
                  >
                    {w.label}
                  </Link>
                  <span className="ml-2 text-[11px] text-slate-400">{w.chain}</span>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-sm font-semibold tabular-nums text-slate-900">
                    {w.amount} <span className="text-xs font-normal text-slate-500">{w.token}</span>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {w.asOf.toISOString().slice(0, 16).replace('T', ' ')}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 大额预警 */}
      <section className="mb-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
          大额预警（近 7 天 amount ≥ {LARGE_THRESHOLD}）
        </h2>
        {largeVouchers.length === 0 ? (
          <EmptyHint text="无大额凭证 ✅" />
        ) : (
          <ul className="space-y-2">
            {largeVouchers.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/finance/vouchers/${v.id}`}
                  className="flex items-baseline justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50/40 px-4 py-2.5 transition hover:border-rose-300 hover:bg-rose-50"
                >
                  <div
                    className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800"
                    title={`${v.summary} · 用途 ${v.debitAccount} · 扣自 ${v.creditAccount}`}
                  >
                    {v.summary}
                    <span className="ml-2 text-[11px] text-slate-500">
                      <span className="text-slate-400">用途</span>{' '}
                      {shortenEthAddressesIn(v.debitAccount)}{' '}
                      <span className="text-slate-400">· 扣自</span>{' '}
                      {shortenEthAddressesIn(v.creditAccount)}
                    </span>
                  </div>
                  <div className="shrink-0 font-mono text-sm font-semibold tabular-nums text-rose-700">
                    {v.amount.toString()} <span className="text-xs font-normal">{v.currency}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number;
  hint?: string;
  accent: 'rose' | 'amber' | 'emerald' | 'slate';
}) {
  const map = {
    rose: 'from-rose-50 to-rose-100/40 ring-rose-200/60 text-rose-700',
    amber: 'from-amber-50 to-amber-100/40 ring-amber-200/60 text-amber-700',
    emerald: 'from-emerald-50 to-emerald-100/40 ring-emerald-200/60 text-emerald-700',
    slate: 'from-slate-50 to-slate-100/40 ring-slate-200/60 text-slate-700',
  } as const;
  return (
    <div className={`rounded-xl bg-gradient-to-br p-3 ring-1 sm:p-4 ${map[accent]}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider opacity-80 sm:text-xs">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums sm:mt-1 sm:text-3xl">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] opacity-70">{hint}</div>}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-sm text-slate-400">
      {text}
    </div>
  );
}
