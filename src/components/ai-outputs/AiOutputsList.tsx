/**
 * AI 输出审核列表（server component）
 *
 * 显示某部门所有 AiOutput 行 + 按 reviewStatus 过滤。
 * 每行点开 → AiOutputDetail（client component，含 approve/reject 按钮）。
 *
 * 默认筛选：pending_human_review 优先在最前；可点 tab 切到 approved/rejected/all。
 */
import Link from 'next/link';
import { AiOutputDetail } from './AiOutputDetail';
import {
  type AiOutputRow,
  REVIEW_STATUS_LABEL,
  REVIEW_STATUS_CLS,
  OUTPUT_TYPE_LABEL,
} from './types';

type StatusFilter = 'pending_human_review' | 'approved' | 'rejected' | 'all';

export function AiOutputsList({
  rows,
  basePath,
  statusFilter,
  totalsByStatus,
  canReview,
  selectedId,
}: {
  rows: AiOutputRow[];
  /** 例 "/dept/lty-legal" */
  basePath: string;
  statusFilter: StatusFilter;
  totalsByStatus: Record<'pending_human_review' | 'approved' | 'rejected' | 'all', number>;
  /** 是否能审核（LEAD / SUPER_ADMIN） */
  canReview: boolean;
  /** 当前展开详情的 row id（searchParams 控制） */
  selectedId: string | null;
}) {
  const expanded = selectedId ? rows.find((r) => r.id === selectedId) ?? null : null;

  if (rows.length === 0 && totalsByStatus.all === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/40 px-6 py-12 text-center text-sm text-slate-500">
        <div className="text-2xl">📥</div>
        <p className="mt-2">还没有 AI 输出待审。</p>
        <p className="mt-1 text-xs text-slate-400">
          法务 AI 调 <code className="rounded bg-white px-1">POST /api/v1/ai-outputs</code>{' '}
          后会自动出现在这里等审批。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 状态过滤 chip 行 */}
      <div className="flex flex-wrap items-baseline gap-1.5">
        <StatusChip
          label={`全部 (${totalsByStatus.all})`}
          href={`${basePath}?tab=ai-outputs`}
          active={statusFilter === 'all'}
          tone="slate"
        />
        <StatusChip
          label={`待审 (${totalsByStatus.pending_human_review})`}
          href={`${basePath}?tab=ai-outputs&status=pending_human_review`}
          active={statusFilter === 'pending_human_review'}
          tone="amber"
        />
        <StatusChip
          label={`已通过 (${totalsByStatus.approved})`}
          href={`${basePath}?tab=ai-outputs&status=approved`}
          active={statusFilter === 'approved'}
          tone="emerald"
        />
        <StatusChip
          label={`已拒绝 (${totalsByStatus.rejected})`}
          href={`${basePath}?tab=ai-outputs&status=rejected`}
          active={statusFilter === 'rejected'}
          tone="slate"
        />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-6 py-8 text-center text-sm text-slate-500">
          该状态下没有记录。
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {rows.map((r) => {
            const isOpen = r.id === selectedId;
            const detailHref = isOpen
              ? `${basePath}?tab=ai-outputs${statusFilter !== 'all' ? `&status=${statusFilter}` : ''}`
              : `${basePath}?tab=ai-outputs&id=${r.id}${statusFilter !== 'all' ? `&status=${statusFilter}` : ''}`;
            return (
              <li key={r.id} className="bg-white">
                <Link
                  href={detailHref}
                  scroll={false}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2.5 text-sm hover:bg-slate-50 sm:px-4"
                >
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${REVIEW_STATUS_CLS[r.reviewStatus]}`}
                  >
                    {REVIEW_STATUS_LABEL[r.reviewStatus]}
                  </span>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                    {OUTPUT_TYPE_LABEL[r.outputType] ?? r.outputType}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                    {r.title}
                  </span>
                  <span className="shrink-0 text-[10px] text-slate-500">{r.agentName}</span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-slate-400">
                    {new Date(r.createdAt).toLocaleString('zh-HK', { hour12: false }).slice(5, 16)}
                  </span>
                  <span className="shrink-0 text-[10px] text-slate-400">{isOpen ? '▾' : '▸'}</span>
                </Link>
                {isOpen && expanded && expanded.id === r.id && (
                  <div className="border-t border-slate-100 bg-slate-50/30 px-3 py-3 sm:px-5 sm:py-4">
                    <AiOutputDetail row={expanded} basePath={basePath} canReview={canReview} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatusChip({
  label,
  href,
  active,
  tone,
}: {
  label: string;
  href: string;
  active: boolean;
  tone: 'slate' | 'amber' | 'emerald';
}) {
  const map = {
    slate: active
      ? 'bg-slate-700 text-white ring-slate-700'
      : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
    amber: active
      ? 'bg-amber-500 text-white ring-amber-500'
      : 'bg-white text-amber-700 ring-amber-200 hover:bg-amber-50',
    emerald: active
      ? 'bg-emerald-600 text-white ring-emerald-600'
      : 'bg-white text-emerald-700 ring-emerald-200 hover:bg-emerald-50',
  };
  return (
    <Link
      href={href}
      scroll={false}
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${map[tone]}`}
    >
      {label}
    </Link>
  );
}
