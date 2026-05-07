/**
 * LTY 法务部看板 (/dept/lty-legal)
 *
 * 嵌入 dist-two-beta-41.vercel.app 的功能版（自家业务）。MC 法务部
 * 镜像同样 UI 但读 McLegalRequest（物理隔离）。
 *
 * PR D 范围：需求 (Requests) 完整 CRUD；服务 / AI 问答 / 通知留 PR E。
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireDeptView } from '@/lib/dept-access';
import { LEGAL_DEPT_META, type LegalRequestRow } from '@/lib/legal-shared';
import { LegalRequestList } from '@/components/legal/LegalRequestList';
import { DeptApiKeysCard } from '@/components/dept/DeptApiKeysCard';

export const dynamic = 'force-dynamic';

const META = LEGAL_DEPT_META.lty;

type TabKey = 'requests' | 'services' | 'ai' | 'notifications';

const TABS: { key: TabKey; label: string; ready: boolean }[] = [
  { key: 'requests', label: '需求', ready: true },
  { key: 'services', label: '服务目录', ready: false },
  { key: 'ai', label: 'AI 问答', ready: false },
  { key: 'notifications', label: '通知', ready: false },
];

export default async function LtyLegalPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await requireDeptView(META.slug);
  const sp = await searchParams;
  const requested = (sp.tab as TabKey) ?? 'requests';
  const tab: TabKey = TABS.some((t) => t.key === requested) ? requested : 'requests';
  const canEdit = ctx.level === 'LEAD' || ctx.isSuperAdmin;

  const [openCount, urgentCount, inProgressCount, allRows] = await Promise.all([
    prisma.ltyLegalRequest.count({ where: { status: 'OPEN' } }),
    prisma.ltyLegalRequest.count({
      where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, priority: 'URGENT' },
    }),
    prisma.ltyLegalRequest.count({ where: { status: 'IN_PROGRESS' } }),
    prisma.ltyLegalRequest.findMany({
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      include: {
        requester: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  const rows: LegalRequestRow[] = allRows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    priority: r.priority,
    status: r.status,
    requester: r.requester,
    assignee: r.assignee,
    resolvedAt: r.resolvedAt,
    resolutionNote: r.resolutionNote,
    notes: r.notes,
    vaultPath: r.vaultPath,
    createdByAi: r.createdByAi,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{META.title}</h1>
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
        <span className="text-xs text-slate-400">{META.description}</span>
      </header>

      <section className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
        <KpiCard label="待处理" value={openCount} accent="rose" />
        <KpiCard label="进行中" value={inProgressCount} accent="amber" />
        <KpiCard label="紧急" value={urgentCount} accent={urgentCount > 0 ? 'rose' : 'sky'} />
      </section>

      <TabBar current={tab} basePath={`/dept/${META.slug}`} />

      <div className="mt-5">
        {tab === 'requests' && <LegalRequestList requests={rows} deptSlug={META.slug} canEdit={canEdit} />}
        {tab !== 'requests' && <StubTab tabKey={tab} />}
      </div>

      {ctx.isSuperAdmin && (
        <DeptApiKeysCard
          deptName="LTY 法务部"
          scopePrefix="LTY_LEGAL_"
          presetForGenerate="LTY_LEGAL_AI:legal_clerk"
          accent="sky"
        />
      )}
    </div>
  );
}

function TabBar({ current, basePath }: { current: TabKey; basePath: string }) {
  return (
    <nav
      role="tablist"
      className="-mx-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:rounded-xl sm:border sm:bg-white sm:px-1.5 sm:py-1"
    >
      {TABS.map((t) => {
        const active = current === t.key;
        const href = t.key === 'requests' ? basePath : `${basePath}?tab=${t.key}`;
        return (
          <Link
            key={t.key}
            href={href}
            role="tab"
            aria-selected={active}
            scroll={false}
            className={`relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition sm:rounded-lg sm:border-b-0 sm:py-1.5 ${
              active
                ? 'border-sky-500 text-sky-800 sm:bg-sky-50 sm:text-sky-900'
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
    requests: '',
    services: '常见法务服务目录（合同模板 / 知产申请 / 合规检查 / 争议处理）— v1.1 上线',
    ai: 'AI 法务助手对话窗口 — v1.1 上线（接 Coze plugin）',
    notifications: '法务通知流（@assignee / 状态变更 / 截止日提醒）— v1.1 上线',
  };
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/40 px-6 py-12 text-center">
      <div className="text-2xl">🚧</div>
      <p className="mt-2 text-sm text-slate-500">{map[tabKey] || '建设中'}</p>
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
  accent: 'rose' | 'amber' | 'sky' | 'emerald';
}) {
  const map: Record<typeof accent, string> = {
    rose: 'from-rose-50 to-rose-100/40 ring-rose-200/60 text-rose-700',
    amber: 'from-amber-50 to-amber-100/40 ring-amber-200/60 text-amber-700',
    sky: 'from-sky-50 to-sky-100/40 ring-sky-200/60 text-sky-700',
    emerald: 'from-emerald-50 to-emerald-100/40 ring-emerald-200/60 text-emerald-700',
  };
  return (
    <div className={`rounded-xl bg-gradient-to-br p-3 ring-1 sm:p-4 ${map[accent]}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider opacity-80 sm:text-xs">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums sm:mt-1 sm:text-3xl">{value}</div>
    </div>
  );
}
