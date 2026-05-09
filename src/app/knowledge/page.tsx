/**
 * 知识管理部主页 (/knowledge)
 *
 * 老板的"被动可视化"入口 —— 不用打开 Claude Code、不用看 TG，
 * 直接看到知识库管家 + 仓库员 + 审查员都干了什么。
 *
 * 数据源：lty-vault repo `_meta/dashboard.json` + `_meta/inbox_queue.json`
 * （通过 GitHub Contents API 拉取，见 lib/vault-client.ts）
 *
 * 内容：
 * - 4 个健康度 KPI（wiki 页 / raw 文件 / 待审 / 待 ingest）
 * - 仓库员今日活动流（来自 dashboard.scribe.recent_activity）
 * - 待审待办列表（来自 inbox_queue.pending）
 * - 管家最近 ingest（来自 dashboard.curator）
 *
 * MVP 阶段：纯展示，审批 UI 留 v2。
 */
import Link from 'next/link';
import { requireKnowledgeView } from '@/lib/knowledge-access';
import { prisma } from '@/lib/db';
import {
  getVaultDashboard,
  getVaultInboxQueue,
  type DashboardJson,
  type InboxQueueJson,
} from '@/lib/vault-client';
import UploadButton from './upload-button';
import IngestButton from './ingest-button';

export const dynamic = 'force-dynamic';

type RecentUpload = {
  id: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number;
  status: string;
  vaultPath: string | null;
  errorMessage: string | null;
  description: string | null;
  createdAt: Date;
  downloadedAt: Date | null;
};

export default async function KnowledgePage() {
  const ctx = await requireKnowledgeView();

  // 并行拉数据（vault JSON + 看板上传记录）
  const [dashboard, inboxQueue, recentUploads] = await Promise.all([
    getVaultDashboard(),
    getVaultInboxQueue(),
    prisma.pendingUpload.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        filename: true,
        contentType: true,
        sizeBytes: true,
        status: true,
        vaultPath: true,
        errorMessage: true,
        description: true,
        createdAt: true,
        downloadedAt: true,
      },
    }) as Promise<RecentUpload[]>,
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">知识管理部</h1>
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200">
            v1 · 只读
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
          <a
            href="https://github.com/lungtszyiu-creator/lty-vault"
            target="_blank"
            rel="noreferrer"
            className="hover:text-slate-600"
          >
            ↗ vault repo
          </a>
          <span>{dashboard ? `更新于 ${formatTime(dashboard.generated_at)}` : '尚无 dashboard.json'}</span>
        </div>
      </header>

      {/* 顶部 4 KPI */}
      <KpiSection dashboard={dashboard} />

      {/* 团队三角色状态行 */}
      <RoleStrip dashboard={dashboard} />

      {/* 上传文件入口（手机随时扔，Mac worker 拉走） */}
      <UploadSection
        recentUploads={recentUploads}
        canSummonCurator={ctx.canSummonCurator}
        isSuperAdmin={ctx.isSuperAdmin}
      />

      {/* 待审待办 */}
      <PendingSection inboxQueue={inboxQueue} />

      {/* 仓库员活动流 */}
      <ScribeActivitySection dashboard={dashboard} />

      {/* 管家最近 ingest */}
      <CuratorSection dashboard={dashboard} />

      <footer className="mt-10 rounded-xl border border-violet-200/60 bg-violet-50/40 p-4 text-xs text-violet-900">
        💡 这是「知识管理部」的被动可视化入口。审批 / 改归类 / 批量操作 等交互功能在 v2 加。
        想 ingest 资料？还是开 Claude Code：<code className="rounded bg-white px-1.5 py-0.5">cd ~/LTY旭珑/ && claude</code>
      </footer>
    </div>
  );
}

// ============ 各 section ============

function KpiSection({ dashboard }: { dashboard: DashboardJson | null }) {
  if (!dashboard) {
    return (
      <section className="mb-8">
        <EmptyHint text="dashboard.json 还没产出。等仓库员 daemon 第一次跑起来就会有数据。" />
      </section>
    );
  }
  const v = dashboard.vault;
  const action = dashboard.pending_user_action;
  return (
    <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiCard label="Wiki 页" value={v.wiki_pages} accent="violet" hint={`含 ${v.decisions} 篇 ADR`} />
      <KpiCard label="Raw 文件" value={v.raw_files} accent="emerald" hint="部门资料原文" />
      <KpiCard
        label="待审"
        value={action.inbox_pending}
        accent={action.inbox_pending > 0 ? 'rose' : 'slate'}
        hint={action.inbox_pending > 0 ? '需要你点确认' : '清爽'}
      />
      <KpiCard
        label="健康度"
        value={v.broken_links + v.orphan_pages}
        accent={v.broken_links > 0 ? 'amber' : 'sky'}
        hint={`${v.broken_links} 断链 · ${v.orphan_pages} 孤儿`}
      />
    </section>
  );
}

function RoleStrip({ dashboard }: { dashboard: DashboardJson | null }) {
  if (!dashboard) return null;
  return (
    <section className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <RoleCard
        label="知识库管家"
        emoji="🏠"
        accent="violet"
        modelHint="Claude Code · 触发式"
        bottomLine={
          dashboard.curator.last_ingest
            ? `上次 ingest ${formatTime(dashboard.curator.last_ingest.at)}`
            : '无 ingest 记录'
        }
      />
      <RoleCard
        label="仓库员"
        emoji="📦"
        accent="emerald"
        modelHint={`Ollama · ${dashboard.scribe.current_model}`}
        bottomLine={
          dashboard.scribe.last_active
            ? `今日处理 ${dashboard.scribe.today_processed} 文件`
            : '今日待命'
        }
      />
      <RoleCard
        label="审查员"
        emoji="🔍"
        accent="sky"
        modelHint={`Ollama · ${dashboard.inspector.current_model}`}
        bottomLine={
          dashboard.inspector.last_lint_run
            ? `上次 lint ${formatTime(dashboard.inspector.last_lint_run)}`
            : `下次扫描 ${dashboard.inspector.next_scheduled ? formatTime(dashboard.inspector.next_scheduled) : '未安排'}`
        }
      />
    </section>
  );
}

function UploadSection({
  recentUploads,
  canSummonCurator,
  isSuperAdmin,
}: {
  recentUploads: RecentUpload[];
  canSummonCurator: boolean;
  isSuperAdmin: boolean;
}) {
  return (
    <section className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="rounded-xl border border-violet-200/60 bg-violet-50/30 p-5">
          <SectionTitle>上传文件到 vault</SectionTitle>
          <p className="mb-3 text-xs text-slate-500">
            手机也能扔。文件落 <code className="rounded bg-white px-1">raw/_inbox/from_dashboard/&lt;日期&gt;/</code>，
            drudge 09:50 自动归档，或老板召唤管家立刻处理。
          </p>
          <UploadButton isSuperAdmin={isSuperAdmin} />
        </div>

        {canSummonCurator ? (
          <div className="rounded-xl border border-amber-200/60 bg-amber-50/30 p-5">
            <SectionTitle>召唤管家 ingest</SectionTitle>
            <p className="mb-3 text-xs text-slate-500">
              一键让管家（Claude headless）读 _inbox 全部资料 → 一次性写 wiki/ + commit + push。
              首次需 Mac 装 <code className="rounded bg-white px-1">npm install -g @anthropic-ai/claude-code</code> + 登录。
            </p>
            <IngestButton />
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-5">
            <SectionTitle>召唤管家 ingest</SectionTitle>
            <p className="text-xs text-slate-500">
              👁 你是普通员工，可以上传文件但不能召唤管家。每天 09:50 drudge 自动归档你上传的文件。
              急件请联系老板触发。
            </p>
          </div>
        )}
      </div>

      <div>
        <SectionTitle>
          最近上传
          {recentUploads.length > 0 && (
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
              {recentUploads.length}
            </span>
          )}
        </SectionTitle>
        {recentUploads.length === 0 ? (
          <EmptyHint text="还没上传过。点左侧按钮试试。" />
        ) : (
          <ul className="space-y-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {recentUploads.map((u) => (
              <li key={u.id} className="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-2 text-xs last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-700">{u.filename}</div>
                  {u.description && (
                    <div className="mt-0.5 break-words text-[11px] text-slate-600">
                      💬 {u.description}
                    </div>
                  )}
                  {u.vaultPath && (
                    <div className="truncate font-mono text-[10px] text-slate-400">→ {u.vaultPath}</div>
                  )}
                  {u.errorMessage && (
                    <div className="text-[10px] text-rose-600">{u.errorMessage}</div>
                  )}
                </div>
                <UploadStatusBadge status={u.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function UploadStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: '⏳ 等 Mac 拉', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
    downloaded: { label: '✅ 已落地', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    failed: { label: '❌ 失败', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  };
  const m = map[status] ?? { label: status, cls: 'bg-slate-50 text-slate-600 ring-slate-200' };
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${m.cls}`}>
      {m.label}
    </span>
  );
}

function PendingSection({ inboxQueue }: { inboxQueue: InboxQueueJson | null }) {
  return (
    <section className="mb-8">
      <SectionTitle>
        待审待办
        {inboxQueue && inboxQueue.pending.length > 0 && (
          <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-rose-200">
            {inboxQueue.pending.length}
          </span>
        )}
      </SectionTitle>
      {!inboxQueue ? (
        <EmptyHint text="inbox_queue.json 暂未产出。" />
      ) : inboxQueue.pending.length === 0 ? (
        <EmptyHint text="🎉 没有待审条目，仓库员的归类全部高置信度自动落档。" />
      ) : (
        <>
          {/* Mobile：卡片堆 —— 5 列表格在 375px 屏会把摘要列挤到 50-70px，
              中文字按字符强制换行 = 字一个个堆叠 */}
          <ul className="space-y-2 md:hidden">
            {inboxQueue.pending.map((p) => (
              <li
                key={p.path}
                className="rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 break-all font-mono text-xs text-slate-700">
                    {p.path.replace(/^raw\/_inbox\/_pending\//, '')}
                  </div>
                  <ConfidenceBadge value={p.confidence} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <DeptBadge dept={p.guessed_dept} />
                  {p.tags?.slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                {p.summary && (
                  <div className="mt-2 break-words text-xs text-slate-600">{p.summary}</div>
                )}
                <div className="mt-2 text-right text-[11px] text-slate-400">
                  {formatTime(p.processed_at)}
                </div>
              </li>
            ))}
          </ul>
          {/* Desktop：table-fixed + colgroup —— 之前文件名超长会撑爆「文件」列把
              右栏（猜的部门 / 置信度 / 处理时间）推出可视区，老板看不到右半边。
              修：限定列宽 + break-all 让 ASCII 路径自然换行，长摘要 line-clamp 截断 */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[40%]" />{/* 文件 */}
                <col className="w-[110px]" />{/* 猜的部门 */}
                <col />{/* 摘要 — 撑剩余 */}
                <col className="w-[90px]" />{/* 置信度 */}
                <col className="w-[120px]" />{/* 处理时间 */}
              </colgroup>
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">文件</th>
                  <th className="px-3 py-2 text-left">猜的部门</th>
                  <th className="px-3 py-2 text-left">摘要</th>
                  <th className="px-3 py-2 text-right">置信度</th>
                  <th className="px-3 py-2 text-right">处理时间</th>
                </tr>
              </thead>
              <tbody>
                {inboxQueue.pending.map((p) => (
                  <tr key={p.path} className="border-t border-slate-100 hover:bg-rose-50/30">
                    <td className="px-3 py-2 align-top">
                      <div
                        className="break-all font-mono text-[11px] leading-snug text-slate-700"
                        title={p.path}
                      >
                        {p.path.replace(/^raw\/_inbox\/_pending\//, '')}
                      </div>
                      {p.tags && p.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {p.tags.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="whitespace-nowrap rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap text-slate-700">
                      <DeptBadge dept={p.guessed_dept} />
                    </td>
                    <td
                      className="px-3 py-2 align-top text-xs text-slate-600"
                      title={p.summary ?? undefined}
                    >
                      <div className="line-clamp-3 break-words leading-snug">{p.summary}</div>
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap text-right">
                      <ConfidenceBadge value={p.confidence} />
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap text-right text-[11px] text-slate-400">
                      {formatTime(p.processed_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function ScribeActivitySection({ dashboard }: { dashboard: DashboardJson | null }) {
  if (!dashboard) return null;
  const acts = dashboard.scribe.recent_activity;
  return (
    <section className="mb-8">
      <SectionTitle>仓库员今日活动</SectionTitle>
      {acts.length === 0 ? (
        <EmptyHint text="今日仓库员还没动手。等你扔文件进 _inbox/ 它就开干。" />
      ) : (
        <ul className="divide-y divide-slate-200/60 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {acts.map((a, i) => (
            <li key={`${a.at}-${i}`} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="flex min-w-0 items-baseline gap-2">
                <ActionBadge action={a.action} />
                <span className="truncate font-mono text-xs text-slate-600">{a.file}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                {/* post_hoc / gone 状态下，confidence 是仓库员当时的快照，不再有意义。
                    管家已纠正最终归宿，不显示老分数避免误导。 */}
                {typeof a.confidence === 'number' &&
                  !['archived_post_hoc', 'rejected_post_hoc', 'gone'].includes(a.action) && (
                    <ConfidenceBadge value={a.confidence} />
                  )}
                <time>{formatTime(a.at)}</time>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CuratorSection({ dashboard }: { dashboard: DashboardJson | null }) {
  if (!dashboard) return null;
  const c = dashboard.curator;
  return (
    <section className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-violet-200/60 bg-violet-50/30 p-4">
        <div className="text-xs font-medium uppercase tracking-wider text-violet-700">
          上次 ingest
        </div>
        {c.last_ingest ? (
          <>
            <div className="mt-1 truncate text-sm font-medium text-slate-800">
              {c.last_ingest.title}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              触及 {c.last_ingest.pages_touched} 篇 · {formatTime(c.last_ingest.at)}
            </div>
          </>
        ) : (
          <div className="mt-1 text-sm text-slate-400">无</div>
        )}
      </div>
      <div className="rounded-xl border border-violet-200/60 bg-violet-50/30 p-4">
        <div className="text-xs font-medium uppercase tracking-wider text-violet-700">本周 ingest</div>
        <div className="mt-1 text-3xl font-semibold tabular-nums text-slate-800">
          {c.this_week_ingests}
        </div>
      </div>
      <div className="rounded-xl border border-violet-200/60 bg-violet-50/30 p-4">
        <div className="text-xs font-medium uppercase tracking-wider text-violet-700">本月 ingest</div>
        <div className="mt-1 text-3xl font-semibold tabular-nums text-slate-800">
          {c.this_month_ingests}
        </div>
      </div>
    </section>
  );
}

// ============ helpers ============

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 flex items-baseline text-sm font-semibold uppercase tracking-wider text-slate-500">
      {children}
    </h2>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-sm text-slate-400">
      {text}
    </div>
  );
}

type Accent = 'rose' | 'amber' | 'emerald' | 'sky' | 'violet' | 'slate';

function KpiCard({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: number;
  accent: Accent;
  hint?: string;
}) {
  const map: Record<Accent, string> = {
    rose: 'from-rose-50 to-rose-100/40 ring-rose-200/60 text-rose-700',
    amber: 'from-amber-50 to-amber-100/40 ring-amber-200/60 text-amber-700',
    emerald: 'from-emerald-50 to-emerald-100/40 ring-emerald-200/60 text-emerald-700',
    sky: 'from-sky-50 to-sky-100/40 ring-sky-200/60 text-sky-700',
    violet: 'from-violet-50 to-violet-100/40 ring-violet-200/60 text-violet-700',
    slate: 'from-slate-50 to-slate-100/40 ring-slate-200/60 text-slate-700',
  };
  return (
    <div className={`rounded-xl bg-gradient-to-br p-4 ring-1 ${map[accent]}`}>
      <div className="text-xs font-medium uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs opacity-70">{hint}</div>}
    </div>
  );
}

function RoleCard({
  label,
  emoji,
  accent,
  modelHint,
  bottomLine,
}: {
  label: string;
  emoji: string;
  accent: Accent;
  modelHint: string;
  bottomLine: string;
}) {
  const map: Record<Accent, string> = {
    rose: 'border-rose-200/60 bg-rose-50/30',
    amber: 'border-amber-200/60 bg-amber-50/30',
    emerald: 'border-emerald-200/60 bg-emerald-50/30',
    sky: 'border-sky-200/60 bg-sky-50/30',
    violet: 'border-violet-200/60 bg-violet-50/30',
    slate: 'border-slate-200/60 bg-slate-50/30',
  };
  return (
    <div className={`rounded-xl border p-4 ${map[accent]}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-800">
          {emoji} {label}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-slate-400">{modelHint}</span>
      </div>
      <div className="mt-2 text-xs text-slate-600">{bottomLine}</div>
    </div>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const cls =
    value >= 0.8
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : value >= 0.5
      ? 'bg-amber-50 text-amber-700 ring-amber-200'
      : 'bg-rose-50 text-rose-700 ring-rose-200';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ring-1 ${cls}`}>
      {pct}%
    </span>
  );
}

function DeptBadge({ dept }: { dept: string }) {
  const map: Record<string, string> = {
    财务部: 'bg-rose-50 text-rose-700 ring-rose-200',
    法务部: 'bg-sky-50 text-sky-700 ring-sky-200',
    行政部: 'bg-amber-50 text-amber-700 ring-amber-200',
    人事部: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    MC法务部: 'bg-purple-50 text-purple-700 ring-purple-200',
  };
  const cls = map[dept] ?? 'bg-slate-50 text-slate-600 ring-slate-200';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${cls}`}>
      {dept}
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    archived: { label: '已归档', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    archived_post_hoc: { label: '管家已归档', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    pending: { label: '待审', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
    rejected: { label: '驳回', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
    rejected_post_hoc: { label: '管家已驳回', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
    gone: { label: '已删', cls: 'bg-slate-100 text-slate-400 ring-slate-200' },
  };
  const m = map[action] ?? { label: action, cls: 'bg-slate-50 text-slate-600 ring-slate-200' };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${m.cls}`}>
      {m.label}
    </span>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)} 天前`;
  return d.toISOString().slice(0, 16).replace('T', ' ');
}
