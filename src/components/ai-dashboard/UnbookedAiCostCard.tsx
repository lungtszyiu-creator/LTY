/**
 * 未入账 AI 成本卡片 — /dept/ai 顶部
 *
 * 老板 5/10：「ai 看板花了多少钱属于公司成本，应该缓存数据，记账 AI 员工
 * 把成本算进去」。这张卡片显示上月 + 本月待入账金额，点链接给凭证编制员
 * 调 period-summary 拿数据写 voucher。
 *
 * 数据来源：lib/ai-cost-period.ts 的 computePeriodSummary()
 *
 * 显示规则：
 *   - 上月有 pending = 红色优先（凭证编制员该跑了）
 *   - 上月全 booked / 0 + 本月有 pending = 灰色（本月还在累，月底再说）
 *   - 全部 0 = 不显示
 *
 * 全员可见（透明文化），但只有 SUPER_ADMIN 看见「→ 录入订阅」链接。
 */
import Link from 'next/link';
import type { PeriodSummary } from '@/lib/ai-cost-period';

export function UnbookedAiCostCard({
  lastMonth,
  currentMonth,
  isSuperAdmin,
}: {
  lastMonth: PeriodSummary;
  currentMonth: PeriodSummary;
  isSuperAdmin: boolean;
}) {
  const lastPending = lastMonth.totals.pendingHkd;
  const lastTotal = lastMonth.totals.grandTotalHkd;
  const currentTotal = currentMonth.totals.grandTotalHkd;
  const currentPending = currentMonth.totals.pendingHkd;

  // 都没钱不显示（避免空卡占位）
  if (lastTotal === 0 && currentTotal === 0) return null;

  // 上月有 pending → 红色"该入账了"提醒
  const lastNeedsBooking = lastPending > 0;

  return (
    <section
      className={`mb-4 rounded-xl border p-4 ${
        lastNeedsBooking
          ? 'border-rose-300 bg-rose-100/30'
          : 'border-slate-200 bg-slate-50/40'
      }`}
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2
          className={`text-sm font-semibold ${
            lastNeedsBooking ? 'text-rose-900' : 'text-slate-700'
          }`}
        >
          💰 AI 成本入账
        </h2>
        {isSuperAdmin && (
          <Link
            href="/finance/subscriptions"
            className="text-[11px] text-violet-800 hover:underline"
          >
            → 管理订阅 / 看 SOP
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PeriodBox
          period={lastMonth}
          label={`上月 (${lastMonth.month})`}
          accent={lastNeedsBooking ? 'rose' : 'emerald'}
          highlight={lastNeedsBooking}
        />
        <PeriodBox
          period={currentMonth}
          label={`本月 (${currentMonth.month}) · 累计中`}
          accent="slate"
          subdued
        />
      </div>

      {lastNeedsBooking && (
        <div className="mt-3 rounded-lg bg-white px-3 py-2 text-[11px] text-rose-900 ring-1 ring-rose-200">
          ⚠️ 上月还有 <strong className="font-mono tabular-nums">HKD {lastPending.toFixed(2)}</strong>{' '}
          没入账（{countPending(lastMonth)} 笔）。凭证编制员 AI 调{' '}
          <code className="rounded bg-rose-50 px-1 font-mono text-[10px]">
            GET /api/v1/ai-cost/period-summary?month={lastMonth.month}
          </code>{' '}
          拿数据，按员工/订阅分笔写 voucher，写完调{' '}
          <code className="rounded bg-rose-50 px-1 font-mono text-[10px]">
            POST /api/v1/ai-cost/mark-booked
          </code>{' '}
          标记防重。
        </div>
      )}

      {!lastNeedsBooking && lastTotal > 0 && (
        <div className="mt-2 text-[11px] text-emerald-800">
          ✅ 上月 AI 成本 HKD {lastTotal.toFixed(2)} 全部已入账（{countBooked(lastMonth)} 笔 voucher）。
        </div>
      )}

      {currentPending > 0 && lastTotal === 0 && (
        <div className="mt-2 text-[11px] text-slate-500">
          本月还在累，月底（下月 1 号）凭证编制员会自动入账。
        </div>
      )}
    </section>
  );
}

function PeriodBox({
  period,
  label,
  accent,
  highlight,
  subdued,
}: {
  period: PeriodSummary;
  label: string;
  accent: 'rose' | 'emerald' | 'slate';
  highlight?: boolean;
  subdued?: boolean;
}) {
  const tonal: Record<typeof accent, string> = {
    rose: 'bg-white text-rose-900 ring-rose-200',
    emerald: 'bg-white text-emerald-900 ring-emerald-200',
    slate: 'bg-white text-slate-700 ring-slate-200',
  };
  const total = period.totals.grandTotalHkd;
  const pending = period.totals.pendingHkd;
  const tokenN = period.tokenCosts.length;
  const subN = period.subscriptions.length;
  return (
    <div
      className={`rounded-lg p-3 ring-1 ${tonal[accent]} ${
        subdued ? 'opacity-80' : ''
      }`}
    >
      <div className="text-[10px] font-medium uppercase tracking-[0.16em] opacity-70">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          className={`font-mono text-2xl font-semibold tabular-nums ${
            highlight ? 'text-rose-700' : ''
          }`}
        >
          HKD {total.toFixed(2)}
        </span>
      </div>
      <div className="mt-1 text-[10px] tabular-nums opacity-70">
        Token {period.totals.tokenHkd.toFixed(2)} ({tokenN} 员工) · 订阅{' '}
        {period.totals.subscriptionHkd.toFixed(2)} ({subN} 个)
      </div>
      {pending > 0 && pending !== total && (
        <div className="mt-0.5 text-[10px] text-rose-700">
          待入账 HKD {pending.toFixed(2)}
        </div>
      )}
    </div>
  );
}

function countPending(p: PeriodSummary): number {
  return (
    p.tokenCosts.filter((t) => !t.alreadyBooked).length +
    p.subscriptions.filter((s) => !s.alreadyBooked).length
  );
}

function countBooked(p: PeriodSummary): number {
  return (
    p.tokenCosts.filter((t) => t.alreadyBooked).length +
    p.subscriptions.filter((s) => s.alreadyBooked).length
  );
}
