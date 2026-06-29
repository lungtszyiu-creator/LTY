/**
 * 审计中心 client component — 2026-06-29 v1
 * - tab 切换(QS 同步)
 * - 全局筛选(actor / 关键词 / 时间范围)
 * - 行点击展开 JSON 详情(modal)
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type TaskAuditRow = {
  id: string;
  taskId: string;
  action: string;
  actorId: string;
  actorEmail: string;
  actorRole: string;
  actorName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  beforeSnapshot: any;
  afterSnapshot: any;
  createdAt: string | Date;
};

type VoucherAuditRow = {
  id: string;
  voucherId: string;
  action: string;
  changedById: string | null;
  byAi: string | null;
  beforeJson: string | null;
  afterJson: string | null;
  reason: string | null;
  createdAt: string | Date;
};

type AiActivityRow = {
  id: string;
  aiRole: string;
  action: string;
  status: string;
  payload: string | null;
  errorMessage: string | null;
  voucherId: string | null;
  chainTransactionId: string | null;
  reconciliationId: string | null;
  fxRateId: string | null;
  telegramSent: boolean;
  vaultWritten: boolean;
  dashboardWritten: boolean;
  createdAt: string | Date;
};

type ApprovalRow = {
  id: string;
  title: string;
  status: string;
  initiatorId: string;
  initiator: { id: string; name: string | null; email: string } | null;
  formJson: string;
  submittedAt: string | Date;
  completedAt: string | Date | null;
  steps: Array<{
    id: string;
    nodeId: string;
    kind: string;
    decision: string | null;
    note: string | null;
    decidedAt: string | Date | null;
    approver: { id: string; name: string | null; email: string } | null;
  }>;
  createdAt: string | Date;
};

type Props = {
  initialTab: string;
  initialFilters: { q: string; from: string; to: string; actor: string };
  data: {
    task: { rows: TaskAuditRow[]; total: number };
    voucher: { rows: VoucherAuditRow[]; total: number };
    ai: { rows: AiActivityRow[]; total: number };
    approval: { rows: ApprovalRow[]; total: number };
  };
};

const TABS = [
  { key: 'task', label: '任务操作' },
  { key: 'voucher', label: '凭证操作' },
  { key: 'ai', label: 'AI 员工' },
  { key: 'approval', label: '审批流转' },
] as const;

function formatTime(t: string | Date | null): string {
  if (!t) return '—';
  const d = typeof t === 'string' ? new Date(t) : t;
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function ActionBadge({ action }: { action: string }) {
  const map: Record<string, string> = {
    DELETE: 'bg-rose-50 text-rose-700 ring-rose-200',
    delete: 'bg-rose-50 text-rose-700 ring-rose-200',
    UPDATE: 'bg-amber-50 text-amber-700 ring-amber-200',
    update: 'bg-amber-50 text-amber-700 ring-amber-200',
    CREATE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    create: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  };
  const cls = map[action] ?? 'bg-slate-50 text-slate-700 ring-slate-200';
  return (
    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ${cls}`}>
      {action}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    failed: 'bg-rose-50 text-rose-700 ring-rose-200',
    error: 'bg-rose-50 text-rose-700 ring-rose-200',
    APPROVED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    REJECTED: 'bg-rose-50 text-rose-700 ring-rose-200',
    IN_PROGRESS: 'bg-amber-50 text-amber-700 ring-amber-200',
    COMPLETED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  };
  const cls = map[status] ?? 'bg-slate-50 text-slate-600 ring-slate-200';
  return (
    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ${cls}`}>
      {status}
    </span>
  );
}

export default function AuditCenterClient({ initialTab, initialFilters, data }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(initialTab);
  const [q, setQ] = useState(initialFilters.q);
  const [from, setFrom] = useState(initialFilters.from);
  const [to, setTo] = useState(initialFilters.to);
  const [actor, setActor] = useState(initialFilters.actor);
  const [detailRow, setDetailRow] = useState<any>(null);

  // 同步 QS,reload SSR(server 拉数据)
  function applyFilters(nextTab = tab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', nextTab);
    if (q) params.set('q', q); else params.delete('q');
    if (from) params.set('from', from); else params.delete('from');
    if (to) params.set('to', to); else params.delete('to');
    if (actor) params.set('actor', actor); else params.delete('actor');
    router.push(`/admin/audit?${params.toString()}`);
  }

  function switchTab(key: string) {
    setTab(key);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', key);
    router.push(`/admin/audit?${params.toString()}`);
  }

  function resetFilters() {
    setQ(''); setFrom(''); setTo(''); setActor('');
    const params = new URLSearchParams();
    params.set('tab', tab);
    router.push(`/admin/audit?${params.toString()}`);
  }

  const currentData = data[tab as keyof typeof data];

  return (
    <>
      {/* tab bar */}
      <nav className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const count = data[t.key as keyof typeof data]?.total ?? 0;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => switchTab(t.key)}
              className={`-mb-px rounded-t-md px-3 py-2 text-sm font-medium transition ${
                active
                  ? 'border-x border-t border-slate-200 bg-white text-slate-900'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {t.label}
              <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      {/* 筛选区 */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">关键词</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="taskId / voucherId / action / 摘要"
              className="mt-0.5 rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">操作人</label>
            <input
              type="text"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              placeholder="email / 名字 / AI role"
              className="mt-0.5 rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">起</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-0.5 rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">止</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-0.5 rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
          </div>
          <button
            onClick={() => applyFilters()}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            筛选
          </button>
          <button
            onClick={resetFilters}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            清空
          </button>
        </div>
      </div>

      {/* 内容 */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {tab === 'task' && <TaskTable rows={data.task.rows} onRowClick={setDetailRow} />}
        {tab === 'voucher' && <VoucherTable rows={data.voucher.rows} onRowClick={setDetailRow} />}
        {tab === 'ai' && <AiTable rows={data.ai.rows} onRowClick={setDetailRow} />}
        {tab === 'approval' && <ApprovalTable rows={data.approval.rows} onRowClick={setDetailRow} />}
      </div>

      {/* 详情 modal */}
      {detailRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setDetailRow(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">操作详情</h3>
              <button
                onClick={() => setDetailRow(null)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            <pre className="overflow-auto rounded-lg bg-slate-50 p-3 text-[11px] leading-snug text-slate-800">
              {JSON.stringify(detailRow, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}

// ─── 4 个 tab 的表格 ─────────────────────────────────

function TaskTable({ rows, onRowClick }: { rows: TaskAuditRow[]; onRowClick: (r: any) => void }) {
  if (rows.length === 0)
    return <EmptyHint text="还没有任务操作记录(2026-06-29 起开始记)。" />;
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
        <tr>
          <th className="px-3 py-2 text-left">时间</th>
          <th className="px-3 py-2 text-left">操作</th>
          <th className="px-3 py-2 text-left">操作人</th>
          <th className="px-3 py-2 text-left">Task ID</th>
          <th className="px-3 py-2 text-left">被删/改 标题</th>
          <th className="px-3 py-2 text-left">IP</th>
          <th className="px-3 py-2 text-center">详情</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const beforeTitle = r.beforeSnapshot?.title ?? '—';
          return (
            <tr
              key={r.id}
              className="cursor-pointer border-t border-slate-100 hover:bg-rose-50/20"
              onClick={() => onRowClick(r)}
            >
              <td className="whitespace-nowrap px-3 py-2 text-[11px] text-slate-600">{formatTime(r.createdAt)}</td>
              <td className="px-3 py-2"><ActionBadge action={r.action} /></td>
              <td className="px-3 py-2">
                <div className="text-xs font-medium text-slate-700">{r.actorName ?? r.actorEmail}</div>
                <div className="text-[10px] text-slate-500">{r.actorEmail} · {r.actorRole}</div>
              </td>
              <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{r.taskId.slice(-8)}</td>
              <td className="px-3 py-2 text-xs text-slate-700">
                <div className="line-clamp-2 max-w-[280px]">{beforeTitle}</div>
              </td>
              <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{r.ipAddress ?? '—'}</td>
              <td className="px-3 py-2 text-center text-xs text-blue-600">查看</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function VoucherTable({ rows, onRowClick }: { rows: VoucherAuditRow[]; onRowClick: (r: any) => void }) {
  if (rows.length === 0) return <EmptyHint text="筛选条件下无凭证操作记录。" />;
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
        <tr>
          <th className="px-3 py-2 text-left">时间</th>
          <th className="px-3 py-2 text-left">操作</th>
          <th className="px-3 py-2 text-left">操作人</th>
          <th className="px-3 py-2 text-left">Voucher ID</th>
          <th className="px-3 py-2 text-left">原因/备注</th>
          <th className="px-3 py-2 text-center">详情</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.id}
            className="cursor-pointer border-t border-slate-100 hover:bg-amber-50/20"
            onClick={() => onRowClick(r)}
          >
            <td className="whitespace-nowrap px-3 py-2 text-[11px] text-slate-600">{formatTime(r.createdAt)}</td>
            <td className="px-3 py-2"><ActionBadge action={r.action} /></td>
            <td className="px-3 py-2 text-xs text-slate-700">
              {r.byAi ? <span className="text-violet-700">🤖 {r.byAi}</span> : r.changedById?.slice(-8) ?? '—'}
            </td>
            <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{r.voucherId.slice(-8)}</td>
            <td className="px-3 py-2 text-xs text-slate-600">
              <div className="line-clamp-2 max-w-[280px]">{r.reason ?? '—'}</div>
            </td>
            <td className="px-3 py-2 text-center text-xs text-blue-600">查看</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AiTable({ rows, onRowClick }: { rows: AiActivityRow[]; onRowClick: (r: any) => void }) {
  if (rows.length === 0) return <EmptyHint text="筛选条件下无 AI 员工活动。" />;
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
        <tr>
          <th className="px-3 py-2 text-left">时间</th>
          <th className="px-3 py-2 text-left">AI 员工</th>
          <th className="px-3 py-2 text-left">动作</th>
          <th className="px-3 py-2 text-center">结果</th>
          <th className="px-3 py-2 text-left">关联</th>
          <th className="px-3 py-2 text-center">写位</th>
          <th className="px-3 py-2 text-center">详情</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.id}
            className="cursor-pointer border-t border-slate-100 hover:bg-violet-50/20"
            onClick={() => onRowClick(r)}
          >
            <td className="whitespace-nowrap px-3 py-2 text-[11px] text-slate-600">{formatTime(r.createdAt)}</td>
            <td className="px-3 py-2 text-xs font-medium text-violet-700">🤖 {r.aiRole}</td>
            <td className="px-3 py-2 text-xs text-slate-700">{r.action}</td>
            <td className="px-3 py-2 text-center"><StatusBadge status={r.status} /></td>
            <td className="px-3 py-2 text-[10px] text-slate-500">
              {r.voucherId && <div>V: …{r.voucherId.slice(-8)}</div>}
              {r.chainTransactionId && <div>T: …{r.chainTransactionId.slice(-8)}</div>}
              {r.fxRateId && <div>FX: …{r.fxRateId.slice(-8)}</div>}
            </td>
            <td className="px-3 py-2 text-center text-[10px]">
              {r.telegramSent && <span title="发了 TG">📱</span>}
              {r.vaultWritten && <span title="写了 vault">📂</span>}
              {r.dashboardWritten && <span title="写了看板">📋</span>}
            </td>
            <td className="px-3 py-2 text-center text-xs text-blue-600">查看</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ApprovalTable({ rows, onRowClick }: { rows: ApprovalRow[]; onRowClick: (r: any) => void }) {
  if (rows.length === 0) return <EmptyHint text="筛选条件下无审批流转。" />;
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
        <tr>
          <th className="px-3 py-2 text-left">提交时间</th>
          <th className="px-3 py-2 text-left">状态</th>
          <th className="px-3 py-2 text-left">发起人</th>
          <th className="px-3 py-2 text-left">标题</th>
          <th className="px-3 py-2 text-left">最近一步</th>
          <th className="px-3 py-2 text-center">详情</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const lastStep = r.steps[r.steps.length - 1];
          return (
            <tr
              key={r.id}
              className="cursor-pointer border-t border-slate-100 hover:bg-emerald-50/20"
              onClick={() => onRowClick(r)}
            >
              <td className="whitespace-nowrap px-3 py-2 text-[11px] text-slate-600">{formatTime(r.submittedAt)}</td>
              <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
              <td className="px-3 py-2 text-xs text-slate-700">{r.initiator?.name ?? r.initiator?.email ?? '—'}</td>
              <td className="px-3 py-2 text-xs text-slate-700">
                <div className="line-clamp-2 max-w-[280px]">{r.title}</div>
              </td>
              <td className="px-3 py-2 text-[11px] text-slate-600">
                {lastStep ? (
                  <>
                    {lastStep.decision ? <ActionBadge action={lastStep.decision} /> : <span className="text-slate-400">未决</span>}
                    <span className="ml-1.5">{lastStep.approver?.name ?? lastStep.approver?.email ?? '—'}</span>
                  </>
                ) : <span className="text-slate-400">无步骤</span>}
              </td>
              <td className="px-3 py-2 text-center text-xs text-blue-600">查看</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}
