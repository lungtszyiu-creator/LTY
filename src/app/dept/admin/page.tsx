/**
 * 行政部看板 (/dept/admin)
 *
 * 7 大块：证照 / 资产 / 设施 / 应急 / 巡检 / IT 工单 / 用品
 * PR A 范围：证照 + 资产 完整 CRUD；其它先占位"建设中"。
 *
 * 风格：复用 /finance 的 KPI + Tabs + mobile-first 模式。
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireDeptView } from '@/lib/dept-access';
import { LicensesTab } from './_components/LicensesTab';
import { AssetsTab } from './_components/AssetsTab';
import { DeptApiKeysCard } from '@/components/dept/DeptApiKeysCard';

export const dynamic = 'force-dynamic';

type TabKey = 'licenses' | 'assets' | 'facilities' | 'emergency' | 'inspection' | 'it' | 'supplies';

const TABS: { key: TabKey; label: string; ready: boolean }[] = [
  { key: 'licenses', label: '证照合同', ready: true },
  { key: 'assets', label: '固定资产', ready: true },
  { key: 'facilities', label: '会议室', ready: false },
  { key: 'emergency', label: '应急演练', ready: false },
  { key: 'inspection', label: '月度巡检', ready: false },
  { key: 'it', label: 'IT 工单', ready: false },
  { key: 'supplies', label: '用品库存', ready: false },
];

export default async function AdminDeptPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await requireDeptView('admin');
  const sp = await searchParams;
  const requested = (sp.tab as TabKey) ?? 'licenses';
  const tab: TabKey = TABS.some((t) => t.key === requested) ? requested : 'licenses';
  const canEdit = ctx.level === 'LEAD' || ctx.isSuperAdmin;

  const [licensesCount, expiringSoonCount, assetsCount, idleAssetsCount] = await Promise.all([
    prisma.adminLicense.count({ where: { status: { in: ['ACTIVE', 'EXPIRING'] } } }),
    prisma.adminLicense.count({
      where: {
        status: { in: ['ACTIVE', 'EXPIRING'] },
        expireAt: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), gte: new Date() },
      },
    }),
    prisma.adminFixedAsset.count({ where: { status: { in: ['IN_USE', 'IDLE'] } } }),
    prisma.adminFixedAsset.count({ where: { status: 'IDLE' } }),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">行政部</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
              ctx.isSuperAdmin
                ? 'bg-rose-50 text-rose-700 ring-rose-200'
                : ctx.level === 'LEAD'
                ? 'bg-amber-50 text-amber-700 ring-amber-200'
                : 'bg-sky-50 text-sky-700 ring-sky-200'
            }`}
          >
            {ctx.isSuperAdmin ? '👑 总管' : ctx.level === 'LEAD' ? '部门负责人' : '部门成员'}
          </span>
        </div>
        <span className="text-xs text-slate-400">数据每次刷新页面即更新</span>
      </header>

      {/* KPI 三连 */}
      <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <KpiCard label="在用证照" value={licensesCount} accent="violet" />
        <KpiCard
          label="30 天内到期"
          value={expiringSoonCount}
          accent={expiringSoonCount > 0 ? 'rose' : 'emerald'}
        />
        <KpiCard label="在用资产" value={assetsCount} accent="amber" />
        <KpiCard label="闲置资产" value={idleAssetsCount} accent="slate" />
      </section>

      {/* Tabs */}
      <TabBar current={tab} />

      {/* Tab content */}
      <div className="mt-5">
        {tab === 'licenses' && <LicensesTab canEdit={canEdit} />}
        {tab === 'assets' && <AssetsTab canEdit={canEdit} />}
        {(tab === 'facilities' || tab === 'emergency' || tab === 'inspection' || tab === 'it' || tab === 'supplies') && (
          <StubTab tabKey={tab} />
        )}
      </div>

      {ctx.isSuperAdmin && (
        <DeptApiKeysCard
          deptName="行政部"
          scopePrefix="ADMIN_"
          presetForGenerate="ADMIN_AI:license_clerk"
          accent="amber"
        />
      )}
    </div>
  );
}

function TabBar({ current }: { current: TabKey }) {
  return (
    <nav
      role="tablist"
      aria-label="行政部分区"
      className="-mx-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:rounded-xl sm:border sm:bg-white sm:px-1.5 sm:py-1"
    >
      {TABS.map((t) => {
        const active = current === t.key;
        const href = t.key === 'licenses' ? '/dept/admin' : `/dept/admin?tab=${t.key}`;
        return (
          <Link
            key={t.key}
            href={href}
            role="tab"
            aria-selected={active}
            scroll={false}
            className={`relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition sm:rounded-lg sm:border-b-0 sm:py-1.5 ${
              active
                ? 'border-amber-500 text-amber-800 sm:bg-amber-50 sm:text-amber-900'
                : 'border-transparent text-slate-500 hover:text-slate-800 sm:hover:bg-slate-50'
            }`}
          >
            <span>{t.label}</span>
            {!t.ready && (
              <span className="ml-1 rounded bg-slate-100 px-1 py-px text-[9px] uppercase tracking-wider text-slate-500">
                建设中
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function StubTab({ tabKey }: { tabKey: TabKey }) {
  const map: Record<TabKey, string> = {
    licenses: '',
    assets: '',
    facilities: '会议室预定 + 设备清单（v1.1 上线）',
    emergency: '应急演练记录 + 应急联系人（v1.1 上线）',
    inspection: '月度巡检记录（v1.1 上线）',
    it: 'IT 报修工单（v1.1 上线）',
    supplies: '办公用品库存 + 安全库存预警（v1.1 上线）',
  };
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/40 px-6 py-12 text-center">
      <div className="text-2xl">🚧</div>
      <p className="mt-2 text-sm text-slate-500">{map[tabKey] || '建设中'}</p>
      <p className="mt-1 text-xs text-slate-400">
        Schema 已就位，UI 在下一轮 PR 上线
      </p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: 'rose' | 'amber' | 'emerald' | 'sky' | 'violet' | 'slate';
}) {
  const map: Record<typeof accent, string> = {
    rose: 'from-rose-50 to-rose-100/40 ring-rose-200/60 text-rose-700',
    amber: 'from-amber-50 to-amber-100/40 ring-amber-200/60 text-amber-700',
    emerald: 'from-emerald-50 to-emerald-100/40 ring-emerald-200/60 text-emerald-700',
    sky: 'from-sky-50 to-sky-100/40 ring-sky-200/60 text-sky-700',
    violet: 'from-violet-50 to-violet-100/40 ring-violet-200/60 text-violet-700',
    slate: 'from-slate-50 to-slate-100/40 ring-slate-200/60 text-slate-700',
  };
  return (
    <div className={`rounded-xl bg-gradient-to-br p-3 ring-1 sm:p-4 ${map[accent]}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider opacity-80 sm:text-xs">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums sm:mt-1 sm:text-3xl">{value}</div>
    </div>
  );
}
