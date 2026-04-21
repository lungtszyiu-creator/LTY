'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

type Approver = { id: string; name: string | null; email: string };
type Item = {
  id: string;
  title: string;
  status: string;
  submittedAt: string;
  completedAt: string | null;
  template: { id: string; name: string; icon: string | null; category: string };
  initiator: { id: string; name: string | null; email: string };
  pendingApprovers: Approver[];
};
type CategoryMeta = Record<string, { label: string; icon: string }>;

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  IN_PROGRESS: { label: '审批中', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  APPROVED:    { label: '✓ 已通过', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  REJECTED:    { label: '× 已驳回', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  CANCELLED:   { label: '已撤销', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

export default function AdminApprovalsClient({
  initial,
  categoryMeta,
}: {
  initial: Item[];
  categoryMeta: CategoryMeta;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | { id: string; decision: 'APPROVED' | 'REJECTED' }>(null);
  const [err, setErr] = useState<string | null>(null);

  // Batch selection (only in-progress rows can be selected — the rest
  // already have a terminal status and would fail the override anyway).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchNote, setBatchNote] = useState('');
  const [batchBusy, setBatchBusy] = useState<null | 'APPROVED' | 'REJECTED'>(null);
  const [batchErr, setBatchErr] = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<{ okCount: number; failCount: number; fails: { id: string; error?: string }[] } | null>(null);

  const inProgressItems = useMemo(() => items.filter((i) => i.status === 'IN_PROGRESS'), [items]);
  const allInProgressSelected = inProgressItems.length > 0 && inProgressItems.every((i) => selectedIds.has(i.id));

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAllInProgress() {
    if (allInProgressSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(inProgressItems.map((i) => i.id)));
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setBatchErr(null);
    setBatchResult(null);
  }

  async function forceDecide(id: string, decision: 'APPROVED' | 'REJECTED') {
    const note = (noteDraft[id] ?? '').trim();
    if (decision === 'REJECTED' && !note) {
      setErr('驳回必须填写理由');
      return;
    }
    if (!confirm(`确认以管理员身份${decision === 'APPROVED' ? '强制通过' : '强制驳回'}该审批？该操作会被记录在审批时间线。`)) return;
    setBusy({ id, decision }); setErr(null);
    try {
      const res = await fetch(`/api/admin/approvals/${id}/force`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: note || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '操作失败');
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: decision, pendingApprovers: [] } : it)));
      setActingOn(null);
      setNoteDraft((d) => ({ ...d, [id]: '' }));
      router.refresh();
    } catch (e: any) {
      setErr(e.message || '操作失败');
    } finally {
      setBusy(null);
    }
  }

  async function batchDecide(decision: 'APPROVED' | 'REJECTED') {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const note = batchNote.trim();
    if (decision === 'REJECTED' && !note) {
      setBatchErr('批量驳回必须填写理由（会同时附到每一条）');
      return;
    }
    const verb = decision === 'APPROVED' ? '强制通过' : '强制驳回';
    if (!confirm(`确认批量${verb} ${ids.length} 条审批？该操作不可撤销，会逐条写入审计记录并通知发起人。`)) return;

    setBatchBusy(decision); setBatchErr(null); setBatchResult(null);
    try {
      const res = await fetch(`/api/admin/approvals/batch/force`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, decision, note: note || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '批量操作失败');
      const body = await res.json();
      const okSet = new Set<string>(
        (body.results as { id: string; ok: boolean }[]).filter((r) => r.ok).map((r) => r.id)
      );
      setItems((prev) =>
        prev.map((it) => (okSet.has(it.id) ? { ...it, status: decision, pendingApprovers: [] } : it))
      );
      setSelectedIds(new Set());
      setBatchNote('');
      setBatchResult({
        okCount: body.okCount,
        failCount: body.failCount,
        fails: (body.results as { id: string; ok: boolean; error?: string }[]).filter((r) => !r.ok),
      });
      router.refresh();
    } catch (e: any) {
      setBatchErr(e.message || '批量操作失败');
    } finally {
      setBatchBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* Batch toolbar — sticks to top when there are in-progress rows */}
      {inProgressItems.length > 0 && (
        <div className="sticky top-[72px] z-20 -mx-1 mb-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 backdrop-blur-sm shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={allInProgressSelected}
                onChange={toggleSelectAllInProgress}
                className="h-4 w-4 rounded border-slate-300"
              />
              {allInProgressSelected ? '取消全选' : '全选审批中'} ({inProgressItems.length})
            </label>
            <span className="text-sm text-slate-500">
              {selectedIds.size > 0 ? <>已选 <strong className="text-slate-800">{selectedIds.size}</strong> 条</> : '未选择任何条目'}
            </span>
            {selectedIds.size > 0 && (
              <button onClick={clearSelection} className="text-xs text-slate-500 hover:text-slate-800 hover:underline">
                清空选择
              </button>
            )}
          </div>

          {selectedIds.size > 0 && (
            <div className="mt-3 rounded-lg bg-indigo-50/80 p-3 ring-1 ring-indigo-200">
              <div className="mb-2 text-xs font-semibold text-indigo-900">
                ⚡ 批量后台审批 · 将对已选 {selectedIds.size} 条统一{batchBusy ? '处理中…' : '决定'}
              </div>
              <textarea
                value={batchNote}
                onChange={(e) => setBatchNote(e.target.value)}
                rows={2}
                placeholder="批量审批意见（通过可不填；驳回必填。会附到每一条的时间线上）"
                className="textarea bg-white text-sm"
              />
              {batchErr && <p className="mt-2 text-sm text-rose-600">⚠️ {batchErr}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => batchDecide('APPROVED')}
                  disabled={!!batchBusy}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white shadow transition disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #34d399 0%, #059669 55%, #047857 100%)' }}
                >
                  {batchBusy === 'APPROVED' ? `通过中 (${selectedIds.size})…` : `✓ 批量通过 (${selectedIds.size})`}
                </button>
                <button
                  onClick={() => batchDecide('REJECTED')}
                  disabled={!!batchBusy}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white shadow transition disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #fb7185 0%, #e11d48 55%, #9f1239 100%)' }}
                >
                  {batchBusy === 'REJECTED' ? `驳回中 (${selectedIds.size})…` : `× 批量驳回 (${selectedIds.size})`}
                </button>
              </div>
            </div>
          )}

          {batchResult && (
            <div className={`mt-3 rounded-lg px-3 py-2 text-sm ring-1 ${
              batchResult.failCount === 0
                ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                : 'bg-amber-50 text-amber-900 ring-amber-200'
            }`}>
              {batchResult.failCount === 0 ? '✓' : '⚠️'}
              {' '}成功 <strong>{batchResult.okCount}</strong> 条
              {batchResult.failCount > 0 && (
                <> · 失败 <strong>{batchResult.failCount}</strong> 条：{batchResult.fails.slice(0, 3).map((f) => f.error).join('、')}{batchResult.fails.length > 3 ? `…等` : ''}</>
              )}
              <button onClick={() => setBatchResult(null)} className="ml-2 text-xs text-slate-500 hover:underline">关闭</button>
            </div>
          )}
        </div>
      )}

      <ul className="space-y-3 rise rise-delay-2">
        {items.map((i) => {
          const cat = categoryMeta[i.template.category] ?? categoryMeta.OTHER ?? { label: i.template.category, icon: '📋' };
          const sm = STATUS_META[i.status] ?? STATUS_META.IN_PROGRESS;
          const isOpen = actingOn === i.id;
          const isInProgress = i.status === 'IN_PROGRESS';
          const isSelected = selectedIds.has(i.id);
          return (
            <li key={i.id} className={`card p-4 transition sm:p-5 ${isSelected ? 'ring-2 ring-indigo-400' : ''}`}>
              <div className="flex flex-wrap items-start gap-3">
                {isInProgress && (
                  <label className="mt-1 flex shrink-0 cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(i.id)}
                      className="h-4 w-4 rounded border-slate-300"
                      aria-label="选中该条审批"
                    />
                  </label>
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-lg">{i.template.icon ?? cat.icon}</span>
                    <span className="text-xs text-slate-500">{cat.label} · {i.template.name}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ${sm.cls}`}>{sm.label}</span>
                  </div>
                  <Link href={`/approvals/${i.id}`} className="block">
                    <h3 className="line-clamp-1 text-base font-semibold hover:underline">{i.title}</h3>
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    <span>发起人：{i.initiator.name ?? i.initiator.email}</span>
                    <span>· 提交 {fmt(i.submittedAt)}</span>
                    {i.completedAt && <span>· 完结 {fmt(i.completedAt)}</span>}
                  </div>
                  {isInProgress && i.pendingApprovers.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-slate-500">待审：</span>
                      {i.pendingApprovers.map((a) => (
                        <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-900 ring-1 ring-amber-200">
                          {a.name ?? a.email}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Link href={`/approvals/${i.id}`} className="btn btn-ghost text-xs">查看详情</Link>
                  {isInProgress && (
                    <button
                      onClick={() => setActingOn((v) => (v === i.id ? null : i.id))}
                      className="text-xs font-medium text-indigo-600 hover:underline"
                    >
                      {isOpen ? '收起' : '⚡ 后台直接审批'}
                    </button>
                  )}
                </div>
              </div>

              {isOpen && isInProgress && (
                <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs text-indigo-900">
                    ⚡ <span className="font-semibold">管理员后台操作</span> · 该决定会覆盖当前所有待处理环节，并通知发起人
                  </div>
                  <textarea
                    value={noteDraft[i.id] ?? ''}
                    onChange={(e) => setNoteDraft((d) => ({ ...d, [i.id]: e.target.value }))}
                    rows={2}
                    placeholder="审批意见（通过可不填；驳回必填）"
                    className="textarea bg-white"
                  />
                  {err && <p className="mt-2 text-sm text-rose-600">⚠️ {err}</p>}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => forceDecide(i.id, 'APPROVED')}
                      disabled={!!busy}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-white shadow transition disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #34d399 0%, #059669 55%, #047857 100%)' }}
                    >
                      {busy?.id === i.id && busy.decision === 'APPROVED' ? '通过中…' : '✓ 强制通过'}
                    </button>
                    <button
                      onClick={() => forceDecide(i.id, 'REJECTED')}
                      disabled={!!busy}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-white shadow transition disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #fb7185 0%, #e11d48 55%, #9f1239 100%)' }}
                    >
                      {busy?.id === i.id && busy.decision === 'REJECTED' ? '驳回中…' : '× 强制驳回'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
