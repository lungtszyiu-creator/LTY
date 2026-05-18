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
import { getScopeChoices } from '@/lib/scope-presets';
import { VaultBrowser } from '@/components/vault/VaultBrowser';
import { AiActivityFeed } from '@/components/ai-dashboard/AiActivityFeed';
import { getDeptAiActivitiesToday } from '@/lib/ai-log';
import { AiOutputsList } from '@/components/ai-outputs/AiOutputsList';
import type { AiOutputRow } from '@/components/ai-outputs/types';

export const dynamic = 'force-dynamic';

const META = LEGAL_DEPT_META.lty;

type TabKey = 'requests' | 'vault' | 'ai-outputs' | 'services' | 'ai' | 'notifications';

const TABS: { key: TabKey; label: string; ready: boolean }[] = [
  { key: 'requests', label: '需求', ready: true },
  { key: 'vault', label: '📁 vault 文档', ready: true },
  { key: 'ai-outputs', label: '📥 AI 输出审核', ready: true },
  { key: 'services', label: '服务目录', ready: false },
  { key: 'ai', label: 'AI 问答', ready: false },
  { key: 'notifications', label: '通知', ready: false },
];

type AiOutputStatusFilter = 'pending_human_review' | 'approved' | 'rejected' | 'all';
const VALID_STATUS_FILTERS: AiOutputStatusFilter[] = [
  'pending_human_review',
  'approved',
  'rejected',
  'all',
];

export default async function LtyLegalPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string; id?: string }>;
}) {
  const ctx = await requireDeptView(META.slug);
  const sp = await searchParams;
  const requested = (sp.tab as TabKey) ?? 'requests';
  const tab: TabKey = TABS.some((t) => t.key === requested) ? requested : 'requests';
  const canEdit = ctx.level === 'LEAD' || ctx.isSuperAdmin;

  // AI 输出审核 tab 的过滤参数
  const aiOutputStatus: AiOutputStatusFilter =
    sp.status && VALID_STATUS_FILTERS.includes(sp.status as AiOutputStatusFilter)
      ? (sp.status as AiOutputStatusFilter)
      : 'pending_human_review';
  const aiOutputSelectedId = sp.id ?? null;

  const aiOutputWhere = aiOutputStatus === 'all'
    ? { deptSlug: 'lty-legal' }
    : { deptSlug: 'lty-legal', reviewStatus: aiOutputStatus };

  const [openCount, urgentCount, inProgressCount, allRows, aiActivities, aiOutputRows, aiOutputCounts] =
    await Promise.all([
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
      getDeptAiActivitiesToday(['lty-legal']),
      // 只有 tab=ai-outputs 时才真查（其他 tab 列表不需要）
      tab === 'ai-outputs'
        ? prisma.aiOutput.findMany({
            where: aiOutputWhere,
            orderBy: [{ reviewStatus: 'asc' }, { createdAt: 'desc' }],
            take: 100,
            include: {
              reviewedBy: { select: { id: true, name: true, email: true } },
            },
          })
        : Promise.resolve([]),
      // counts by status（每个 tab 都查一次，让 chip 显示数字）
      tab === 'ai-outputs'
        ? prisma.aiOutput.groupBy({
            by: ['reviewStatus'],
            where: { deptSlug: 'lty-legal' },
            _count: { _all: true },
          })
        : Promise.resolve([]),
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

  // 序列化 AiOutput rows (Date → ISO; Decimal → number)
  const aiOutputs: AiOutputRow[] = aiOutputRows.map((r) => ({
    id: r.id,
    outputId: r.outputId,
    agentName: r.agentName,
    deptSlug: r.deptSlug,
    outputType: r.outputType,
    title: r.title,
    contentMarkdown: r.contentMarkdown,
    revisedDoc: r.revisedDoc,
    cleanDoc: r.cleanDoc,
    sourceInput: r.sourceInput,
    metadata: r.metadata,
    triggeredBy: r.triggeredBy,
    reviewStatus: r.reviewStatus as AiOutputRow['reviewStatus'],
    reviewedBy: r.reviewedBy,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    reviewNote: r.reviewNote,
    vaultPath: r.vaultPath,
    vaultCommitSha: r.vaultCommitSha,
    vaultCommittedAt: r.vaultCommittedAt?.toISOString() ?? null,
    tokenCostHkd: r.tokenCostHkd === null ? null : Number(r.tokenCostHkd),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  // count chip 数字
  const countMap: Record<string, number> = {};
  for (const g of aiOutputCounts) countMap[g.reviewStatus] = g._count._all;
  const totalsByStatus = {
    pending_human_review: countMap.pending_human_review ?? 0,
    approved: countMap.approved ?? 0,
    rejected: countMap.rejected ?? 0,
    all:
      (countMap.pending_human_review ?? 0) +
      (countMap.approved ?? 0) +
      (countMap.rejected ?? 0),
  };

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
        {tab === 'vault' && (
          <VaultBrowser
            apiPath="/api/dept/vault-tree"
            initialPath="raw/法务部"
            repoUrl="https://github.com/lungtszyiu-creator/lty-vault/tree/main/raw/%E6%B3%95%E5%8A%A1%E9%83%A8"
          />
        )}
        {tab === 'ai-outputs' && (
          <AiOutputsList
            rows={aiOutputs}
            basePath={`/dept/${META.slug}`}
            statusFilter={aiOutputStatus}
            totalsByStatus={totalsByStatus}
            canReview={canEdit}
            selectedId={aiOutputSelectedId}
          />
        )}
        {tab !== 'requests' && tab !== 'vault' && tab !== 'ai-outputs' && <StubTab tabKey={tab} />}
      </div>

      {/* LTY 法务 AI 今日工作日记 — 老板 5/13：法务 AI 自报活动同步显示在本部门看板 + AI 部看板 */}
      <div className="mt-6">
        <AiActivityFeed rows={aiActivities} />
      </div>

      {(ctx.isSuperAdmin || ctx.level === 'LEAD') && (
        <DeptApiKeysCard
          deptName="LTY 法务部"
          scopePrefix="LTY_LEGAL_"
          scopeChoices={getScopeChoices('LTY_LEGAL_')}
          canManage={ctx.isSuperAdmin || ctx.level === 'LEAD'}
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
    vault: '',
    'ai-outputs': '',
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
