/**
 * 财务出纳看板 (/dept/cashier)
 *
 * 嵌入老板出纳自己做的 manus 看板（xrlfinance-hxrs3bpd）。
 * PR E 范围：主页 KPI 框架 + 7 个子 Tab 占位（待处理 / 报销 / 对账 /
 * 合规台账 / 预算 / 月度结算 / 工资单）。子页业务逻辑等老板发详细截图后
 * 在 PR I 接入。
 *
 * 数据：本阶段 KPI 直接读现有 LTY 财务数据：
 * - 法币汇率 → /api/finance/fx-rates 已有（PR 36 之前）
 * - 加密 → 未接（先 placeholder）
 * - 月收入/支出/毛利 → 未来接 cron 聚合，先 placeholder
 *
 * 出纳页和现有 /finance 不互斥：
 * - /finance = LTY 总财务（凭证 / 钱包 / 银行 / AI 活动流）—— 老板每天看 AI 干啥
 * - /dept/cashier = 出纳每天用的快速录入 / 对账工作台 —— 出纳本人 daily driver
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireDeptView } from '@/lib/dept-access';
import { DeptApiKeysCard } from '@/components/dept/DeptApiKeysCard';
import { getScopeChoices } from '@/lib/scope-presets';
import { ReimbursementsTab } from './_components/ReimbursementsTab';
import { ReconciliationsTab } from './_components/ReconciliationsTab';
import { ComplianceTab } from './_components/ComplianceTab';
import { AiActivityFeed } from '@/components/ai-dashboard/AiActivityFeed';
import { getDeptAiActivitiesToday } from '@/lib/ai-log';

export const dynamic = 'force-dynamic';

type TabKey =
  | 'overview'
  | 'pending'
  | 'expense'
  | 'reconciliation'
  | 'compliance'
  | 'budget'
  | 'monthly'
  | 'payroll';

// PR F（增量层）：把报销 / 对账 / 合规台账 三个 Tab 标 ready，
// 业务表 schema 由 20260508120000_add_cashier_module 迁移补齐。
const TABS: { key: TabKey; label: string; ready: boolean }[] = [
  { key: 'overview', label: '财务概览', ready: true },
  { key: 'pending', label: '待处理', ready: false },
  { key: 'expense', label: '报销', ready: true },
  { key: 'reconciliation', label: '对账', ready: true },
  { key: 'compliance', label: '合规台账', ready: true },
  { key: 'budget', label: '预算管理', ready: false },
  { key: 'monthly', label: '月度结算', ready: false },
  { key: 'payroll', label: '工资单', ready: false },
];

export default async function CashierPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sub?: string }>;
}) {
  const ctx = await requireDeptView('cashier');
  const sp = await searchParams;
  const requested = (sp.tab as TabKey) ?? 'overview';
  const tab: TabKey = TABS.some((t) => t.key === requested) ? requested : 'overview';
  const subCategory = sp.sub ?? null;

  // 读现有 LTY 财务数据：最近 fx 汇率（pair 字段）+ 待审凭证数 + 钱包数
  const [latestUsdHkd, latestUsdCny, pendingVouchers, activeWallets, aiActivities] =
    await Promise.all([
      prisma.fxRate.findFirst({
        where: { pair: 'USD/HKD' },
        orderBy: { date: 'desc' },
        select: { rate: true, date: true },
      }).catch(() => null),
      prisma.fxRate.findFirst({
        where: { pair: 'USD/CNY' },
        orderBy: { date: 'desc' },
        select: { rate: true, date: true },
      }).catch(() => null),
      prisma.voucher.count({ where: { status: 'AI_DRAFT' } }),
      prisma.cryptoWallet.count({ where: { isActive: true } }),
      // 财务出纳看板同时显示 deptSlug='cashier' 与 'finance' 的 AI（两支同源
      // 财务团队的 AI 都聚一起；分页才区分子部门）
      getDeptAiActivitiesToday(['cashier', 'finance']),
    ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">财务出纳</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
              ctx.isSuperAdmin
                ? 'bg-rose-50 text-rose-700 ring-rose-200'
                : ctx.level === 'LEAD'
                ? 'bg-amber-50 text-amber-700 ring-amber-200'
                : 'bg-sky-50 text-sky-700 ring-sky-200'
            }`}
          >
            {ctx.isSuperAdmin ? '👑 总管' : ctx.level === 'LEAD' ? 'CFO / 出纳负责人' : '出纳'}
          </span>
        </div>
        <Link href="/finance" className="text-xs text-sky-700 hover:underline">
          → 切到 LTY 总财务（凭证 / 钱包 / AI）
        </Link>
      </header>

      {/* Tabs */}
      <nav
        role="tablist"
        className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:rounded-xl sm:border sm:bg-white sm:px-1.5 sm:py-1"
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          const href = t.key === 'overview' ? '/dept/cashier' : `/dept/cashier?tab=${t.key}`;
          return (
            <Link
              key={t.key}
              href={href}
              role="tab"
              aria-selected={active}
              scroll={false}
              className={`relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition sm:rounded-lg sm:border-b-0 sm:py-1.5 ${
                active
                  ? 'border-rose-500 text-rose-700 sm:bg-rose-50'
                  : 'border-transparent text-slate-500 hover:text-slate-800 sm:hover:bg-slate-50'
              }`}
            >
              <span>{t.label}</span>
              {!t.ready && t.key !== 'overview' && (
                <span className="ml-1 rounded bg-slate-100 px-1 py-px text-[9px] uppercase tracking-wider text-slate-500">
                  v1.1
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {tab === 'overview' && (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">财务概览</h2>

          {/* 法币汇率 */}
          <section className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
            <FxCard label="USD" value="1.0000" hint="基准" accent="emerald" />
            <FxCard
              label="HKD"
              value={latestUsdHkd ? Number(latestUsdHkd.rate).toFixed(4) : '—'}
              hint={latestUsdHkd ? '实时' : '未导入'}
              accent="amber"
            />
            <FxCard
              label="CNY"
              value={latestUsdCny ? Number(latestUsdCny.rate).toFixed(4) : '—'}
              hint={latestUsdCny ? '实时' : '未导入'}
              accent="sky"
            />
          </section>

          {/* 加密占位 */}
          <section className="mb-5 rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-3 text-xs text-slate-500">
            🪙 加密币种实时价（USDT / USDC / ETH / BTC / SOL）—— v1.1 接 CoinGecko cron。
            目前可在 <Link href="/finance?tab=snapshots" className="underline text-sky-700">/finance 余额快照</Link> 看链上钱包余额。
          </section>

          {/* KPI 简版 */}
          <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
            <KpiCard label="待审凭证" value={pendingVouchers} accent="rose" />
            <KpiCard label="在用钱包" value={activeWallets} accent="amber" />
            <KpiCard label="本月盈利" value="—" accent="emerald" hint="月度结算 v1.1" textValue />
          </section>

          {/* 月收入/支出/毛利 占位 */}
          <section className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
            <MoneyCard label="月收入" value="—" hint="待接入" />
            <MoneyCard label="月支出" value="—" hint="待接入" />
            <MoneyCard label="毛利" value="—" hint="待接入" />
          </section>

          {/* 录入入口（先链回 /finance 下）*/}
          <section className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <NavCard href="/finance?tab=overview" emoji="📋" label="待审凭证" hint="LTY /finance" />
            <NavCard href="/finance?tab=snapshots" emoji="🪙" label="钱包余额" hint="LTY /finance" />
            <NavCard href="/finance?tab=activity" emoji="🤖" label="AI 活动流" hint="LTY /finance" />
            <NavCard href="/admin/finance/access" emoji="🔑" label="出纳权限" hint="管理" />
          </section>
        </>
      )}

      {tab === 'expense' && <ReimbursementsTab canEdit={ctx.level === 'LEAD' || ctx.isSuperAdmin} />}
      {tab === 'reconciliation' && <ReconciliationsTab canEdit={ctx.level === 'LEAD' || ctx.isSuperAdmin} />}
      {tab === 'compliance' && (
        <ComplianceTab
          canEdit={ctx.level === 'LEAD' || ctx.isSuperAdmin}
          isSuperAdmin={ctx.isSuperAdmin}
          subCategory={subCategory}
        />
      )}

      {(tab === 'pending' || tab === 'budget' || tab === 'monthly' || tab === 'payroll') && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/40 px-6 py-12 text-center">
          <div className="text-2xl">🚧</div>
          <p className="mt-2 text-sm text-slate-500">本 Tab v1.1 接入</p>
          <p className="mt-1 text-xs text-slate-400">
            {tab === 'payroll'
              ? '工资单复用 LTY /finance EmployeePayrollProfile，等老板补字段细化'
              : '等老板发出纳子页详细截图（' +
                (tab === 'pending' ? '待处理' : tab === 'budget' ? '预算' : '月度结算') +
                '）后落地'}
          </p>
        </div>
      )}

      {/* 财务 AI 今日工作日记 — finance + cashier 两支 AI 聚一起；
          老板 5/13：财务 AI 自报活动同时显示在本部门看板 + AI 部看板 */}
      <div className="mt-6">
        <AiActivityFeed rows={aiActivities} />
      </div>

      {(ctx.isSuperAdmin || ctx.level === 'LEAD') && (
        <DeptApiKeysCard
          deptName="财务出纳"
          scopePrefix="CASHIER_"
          scopeChoices={getScopeChoices('CASHIER_')}
          canManage={ctx.isSuperAdmin || ctx.level === 'LEAD'}
          accent="rose"
        />
      )}
    </div>
  );
}

function FxCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent: 'emerald' | 'amber' | 'sky';
}) {
  const map = {
    emerald: 'from-emerald-50 to-emerald-100/40 ring-emerald-200/60 text-emerald-700',
    amber: 'from-amber-50 to-amber-100/40 ring-amber-200/60 text-amber-700',
    sky: 'from-sky-50 to-sky-100/40 ring-sky-200/60 text-sky-700',
  } as const;
  return (
    <div className={`rounded-xl bg-gradient-to-br p-3 ring-1 sm:p-4 ${map[accent]}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider opacity-80 sm:text-xs">{label}</div>
      <div className="mt-0.5 font-mono text-xl font-semibold tabular-nums sm:mt-1 sm:text-2xl">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] opacity-70">{hint}</div>}
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  accent,
  textValue,
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent: 'rose' | 'amber' | 'emerald';
  textValue?: boolean;
}) {
  const map = {
    rose: 'from-rose-50 to-rose-100/40 ring-rose-200/60 text-rose-700',
    amber: 'from-amber-50 to-amber-100/40 ring-amber-200/60 text-amber-700',
    emerald: 'from-emerald-50 to-emerald-100/40 ring-emerald-200/60 text-emerald-700',
  } as const;
  return (
    <div className={`rounded-xl bg-gradient-to-br p-3 ring-1 sm:p-4 ${map[accent]}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider opacity-80 sm:text-xs">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold tabular-nums sm:mt-1 sm:text-3xl ${textValue ? 'text-slate-400' : ''}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] opacity-70">{hint}</div>}
    </div>
  );
}

function MoneyCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-400">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-slate-400">{hint}</div>}
    </div>
  );
}

function NavCard({ href, emoji, label, hint }: { href: string; emoji: string; label: string; hint?: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-center transition hover:border-rose-300 hover:bg-rose-50/40"
    >
      <div className="text-2xl">{emoji}</div>
      <div className="mt-1 text-xs font-medium text-slate-800">{label}</div>
      {hint && <div className="mt-0.5 text-[10px] text-slate-500">{hint}</div>}
    </Link>
  );
}
