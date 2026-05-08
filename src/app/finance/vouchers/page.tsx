/**
 * 凭证列表 (/finance/vouchers)
 *
 * 老板/出纳查全部凭证（所有状态 + 日期过滤）。
 * /finance 主页只显示 AI_DRAFT 待审，要看 POSTED/VOIDED 必须来这里。
 *
 * URL 参数：
 *   ?status=ALL|AI_DRAFT|BOSS_REVIEWING|POSTED|REJECTED|VOIDED  默认 ALL
 *   ?range=today|7d|30d|90d|all                                  默认 30d
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireFinanceView } from '@/lib/finance-access';
import { VoucherDeleteButton } from '../voucher-delete-button';

export const dynamic = 'force-dynamic';

type StatusKey = 'ALL' | 'AI_DRAFT' | 'BOSS_REVIEWING' | 'POSTED' | 'REJECTED' | 'VOIDED';
type RangeKey = 'today' | '7d' | '30d' | '90d' | 'all';

const STATUS_META: Record<Exclude<StatusKey, 'ALL'>, { label: string; cls: string }> = {
  AI_DRAFT: { label: '草稿', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  BOSS_REVIEWING: { label: '审核中', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  POSTED: { label: '已过账', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  REJECTED: { label: '已驳回', cls: 'bg-slate-50 text-slate-600 ring-slate-200' },
  VOIDED: { label: '作废', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

const STATUS_TABS: { key: StatusKey; label: string }[] = [
  { key: 'ALL', label: '全部' },
  { key: 'AI_DRAFT', label: '草稿' },
  { key: 'POSTED', label: '已过账' },
  { key: 'VOIDED', label: '作废' },
  { key: 'REJECTED', label: '已驳回' },
];

const RANGE_TABS: { key: RangeKey; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: '7d', label: '7 天' },
  { key: '30d', label: '30 天' },
  { key: '90d', label: '90 天' },
  { key: 'all', label: '全部' },
];

function rangeStart(key: RangeKey): Date | null {
  const now = new Date();
  if (key === 'today') {
    const t = new Date(now);
    t.setHours(0, 0, 0, 0);
    return t;
  }
  const days = key === '7d' ? 7 : key === '30d' ? 30 : key === '90d' ? 90 : null;
  if (days === null) return null;
  const t = new Date(now);
  t.setDate(t.getDate() - days);
  t.setHours(0, 0, 0, 0);
  return t;
}

function buildHref(status: StatusKey, range: RangeKey): string {
  const params = new URLSearchParams();
  if (status !== 'ALL') params.set('status', status);
  if (range !== '30d') params.set('range', range);
  const q = params.toString();
  return q ? `/finance/vouchers?${q}` : '/finance/vouchers';
}

export default async function VouchersListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; range?: string }>;
}) {
  const access = await requireFinanceView();
  const sp = await searchParams;

  const status: StatusKey = (
    ['AI_DRAFT', 'BOSS_REVIEWING', 'POSTED', 'REJECTED', 'VOIDED'] as const
  ).includes(sp.status as never)
    ? (sp.status as StatusKey)
    : 'ALL';
  const range: RangeKey = (['today', '7d', '30d', '90d', 'all'] as const).includes(
    sp.range as never,
  )
    ? (sp.range as RangeKey)
    : '30d';

  const where: { status?: string; date?: { gte: Date } } = {};
  if (status !== 'ALL') where.status = status;
  const start = rangeStart(range);
  if (start) where.date = { gte: start };

  const [vouchers, totalCount] = await Promise.all([
    prisma.voucher.findMany({
      where,
      take: 200,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { name: true } },
        approvalInstance: { select: { id: true, status: true, title: true } },
      },
    }),
    prisma.voucher.count({ where }),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Link href="/finance" className="text-sm text-slate-500 hover:text-slate-800">
            ← 返回财务
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">凭证</h1>
          <p className="mt-1 text-xs text-slate-500">
            全部凭证（所有状态）· 共 {totalCount} 条
            {access.level === 'EDITOR' && (
              <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 ring-1 ring-rose-200">
                👑 全权
              </span>
            )}
          </p>
        </div>
        {access.level === 'EDITOR' && (
          <Link
            href="/finance/vouchers/new"
            className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700"
          >
            + 新建凭证
          </Link>
        )}
      </div>

      {/* 状态过滤 */}
      <nav
        role="tablist"
        aria-label="按状态过滤"
        className="-mx-4 mb-3 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:rounded-xl sm:border sm:bg-white sm:px-1.5 sm:py-1"
      >
        {STATUS_TABS.map((t) => {
          const active = status === t.key;
          return (
            <Link
              key={t.key}
              href={buildHref(t.key, range)}
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

      {/* 日期过滤 */}
      <nav
        role="tablist"
        aria-label="按日期过滤"
        className="mb-5 flex flex-wrap gap-1.5"
      >
        {RANGE_TABS.map((t) => {
          const active = range === t.key;
          return (
            <Link
              key={t.key}
              href={buildHref(status, t.key)}
              role="tab"
              aria-selected={active}
              scroll={false}
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
                active
                  ? 'bg-amber-100 text-amber-800 ring-amber-300'
                  : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {/* 列表 */}
      {vouchers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center text-sm text-slate-400">
          这个过滤条件下没有凭证。试试切换状态或扩大日期范围。
        </div>
      ) : (
        <>
          {/* Mobile：卡片堆 */}
          <ul className="space-y-2 md:hidden">
            {vouchers.map((v) => {
              const sm =
                STATUS_META[v.status as Exclude<StatusKey, 'ALL'>] ??
                { label: v.status, cls: 'bg-slate-50 text-slate-600 ring-slate-200' };
              return (
                <li key={v.id} className="relative rounded-xl border border-slate-200 bg-white">
                  <Link
                    href={`/finance/vouchers/${v.id}`}
                    className="block p-3 transition active:bg-amber-50/40"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="min-w-0 flex-1 truncate pr-2 text-sm font-medium text-slate-800">
                        {v.summary}
                      </div>
                      <div className="shrink-0 font-mono text-sm font-semibold tabular-nums text-slate-900">
                        {v.amount.toString()}{' '}
                        <span className="text-xs font-normal text-slate-500">{v.currency}</span>
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="truncate">
                        {v.debitAccount} → {v.creditAccount}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {v.date.toISOString().slice(0, 10)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${sm.cls}`}
                        >
                          {sm.label}
                        </span>
                        {v.voucherNumber && (
                          <span className="font-mono text-[10px] text-slate-500">
                            {v.voucherNumber}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">
                          {v.createdByAi ? `🤖 ${v.createdByAi}` : v.createdBy?.name ?? '人工'}
                        </span>
                        {access.isSuperAdmin && (
                          <VoucherDeleteButton voucherId={v.id} summary={v.summary} size="sm" />
                        )}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          {/* Desktop：表格 */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">日期</th>
                  <th className="px-4 py-2 text-left">凭证号</th>
                  <th className="px-4 py-2 text-left">摘要</th>
                  <th className="px-4 py-2 text-left">借</th>
                  <th className="px-4 py-2 text-left">贷</th>
                  <th className="px-4 py-2 text-right">金额</th>
                  <th className="px-4 py-2 text-left">状态</th>
                  <th className="px-4 py-2 text-left">来源</th>
                  <th className="px-4 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => {
                  const sm =
                    STATUS_META[v.status as Exclude<StatusKey, 'ALL'>] ??
                    { label: v.status, cls: 'bg-slate-50 text-slate-600 ring-slate-200' };
                  return (
                    <tr
                      key={v.id}
                      className="border-t border-slate-100 transition hover:bg-amber-50/40"
                    >
                      <td className="px-4 py-2 whitespace-nowrap text-slate-600 tabular-nums">
                        <Link href={`/finance/vouchers/${v.id}`} className="block">
                          {v.date.toISOString().slice(0, 10)}
                        </Link>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap font-mono text-xs text-slate-500">
                        <Link href={`/finance/vouchers/${v.id}`} className="block">
                          {v.voucherNumber ?? '—'}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-slate-800">
                        <Link href={`/finance/vouchers/${v.id}`} className="block">
                          {v.summary}
                        </Link>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-slate-600">
                        {v.debitAccount}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-slate-600">
                        {v.creditAccount}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-right font-medium tabular-nums text-slate-900">
                        {v.amount.toString()} {v.currency}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${sm.cls}`}
                        >
                          {sm.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-500">
                        {v.createdByAi ? `🤖 ${v.createdByAi}` : v.createdBy?.name ?? '人工'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-right">
                        <div className="inline-flex items-center gap-2">
                          {access.isSuperAdmin && (
                            <VoucherDeleteButton voucherId={v.id} summary={v.summary} size="sm" />
                          )}
                          <Link
                            href={`/finance/vouchers/${v.id}`}
                            className="inline-flex items-center rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
                          >
                            详情 →
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalCount > vouchers.length && (
            <p className="mt-3 text-xs text-slate-400">
              显示最近 {vouchers.length} 条 / 共 {totalCount} 条 · 缩小日期范围或换状态过滤可定位旧凭证
            </p>
          )}
        </>
      )}
    </div>
  );
}
