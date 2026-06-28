/**
 * /knowledge 待审批 client 组件 — 2026-06-25 v0.1
 *
 * 功能:
 *   - checkbox 多选 (单击 / 全选过滤后 / 反选 / 清空)
 *   - 顶部 sticky 工具栏 (按部门筛选 + 批准 dropdown + 拒绝 + 删除)
 *   - 批量提交 → POST /api/knowledge/inbox/batch-decide
 *   - 提交后 router.refresh() 看板自动更新状态
 *
 * 后台流程:
 *   API 写 InboxApprovalDecision (PENDING)
 *   → iMac launchd com.lty.drudge.inbox-consumer 每 30s 跑
 *   → mv 文件 / git commit / push / 更新 DONE
 */
'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { InboxQueueJson } from '@/lib/vault-client';

// 跟 drudge config.yaml taxonomy 对齐
const DEPT_TYPES: Record<string, string[]> = {
  财务部: [
    'ai_reports', 'tg_archives', 'contracts', 'receipts', 'chain_data',
    'bank_statements', 'manual_notes', 'vouchers', 'fx_rates', 'reconciliations',
  ],
  法务部: ['合同', '票据', '证照', '争议诉讼', '协议', '声明'],
  人事部: ['contracts', 'jds', 'policies', '证件'],
  行政部: ['办公用品', '印章证照', '固定资产'],
  MC业务组: ['01_素材_推文', '02_素材_品牌故事', '03_GEO_技术', '04_广告投放', '09_归档'],
};
const DEPTS = Object.keys(DEPT_TYPES);

type PendingItem = InboxQueueJson['pending'][number];

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${mm}-${dd} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round((value ?? 0) * 100);
  let cls = 'bg-slate-100 text-slate-600 ring-slate-200';
  if (pct >= 80) cls = 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  else if (pct >= 50) cls = 'bg-amber-50 text-amber-700 ring-amber-200';
  else cls = 'bg-rose-50 text-rose-700 ring-rose-200';
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${cls}`}>
      {pct}%
    </span>
  );
}

function DeptBadge({ dept }: { dept: string }) {
  if (!dept) return <span className="text-slate-400">—</span>;
  return (
    <span className="inline-block rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 ring-1 ring-slate-200">
      {dept}
    </span>
  );
}

export default function PendingSectionClient({ inboxQueue }: { inboxQueue: InboxQueueJson | null }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterDept, setFilterDept] = useState<string>('');
  const [approveDept, setApproveDept] = useState<string>('财务部');
  const [approveType, setApproveType] = useState<string>('manual_notes');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const all: PendingItem[] = inboxQueue?.pending ?? [];

  const filtered = useMemo(() => {
    if (!filterDept) return all;
    return all.filter((p) => p.guessed_dept === filterDept);
  }, [all, filterDept]);

  const visibleSelectedCount = useMemo(
    () => filtered.filter((p) => selected.has(p.path)).length,
    [filtered, selected],
  );

  if (!inboxQueue) {
    return (
      <section className="mb-8">
        <SectionTitle>待审待办</SectionTitle>
        <EmptyHint text="inbox_queue.json 暂未产出。" />
      </section>
    );
  }
  if (all.length === 0) {
    return (
      <section className="mb-8">
        <SectionTitle>待审待办</SectionTitle>
        <EmptyHint text="🎉 没有待审条目,仓库员的归类全部高置信度自动落档。" />
      </section>
    );
  }

  function toggle(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }
  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((p) => next.add(p.path));
      return next;
    });
  }
  function invertSelectionFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((p) => {
        if (next.has(p.path)) next.delete(p.path);
        else next.add(p.path);
      });
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }

  async function submit(decision: 'APPROVED' | 'REJECTED' | 'DELETED') {
    if (selected.size === 0) {
      setError('先勾选要处理的条目');
      return;
    }
    if (decision === 'APPROVED' && (!approveDept || !approveType)) {
      setError('批准必须选部门 + 类型');
      return;
    }
    if (decision === 'DELETED') {
      if (!confirm(`确定要物理删除 ${selected.size} 条文件吗?(不可恢复)`)) return;
    }

    const items = all
      .filter((p) => selected.has(p.path))
      .map((p) => ({
        path: p.path,
        summary: p.summary ?? null,
        confidence: p.confidence ?? null,
        guessedDept: p.guessed_dept ?? null,
        guessedType: p.guessed_type ?? null,
      }));

    setError(null);
    setNotice(null);

    startTransition(async () => {
      try {
        const resp = await fetch('/api/knowledge/inbox/batch-decide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items,
            decision,
            approvedDept: decision === 'APPROVED' ? approveDept : null,
            approvedType: decision === 'APPROVED' ? approveType : null,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) {
          setError(data?.detail || data?.error || `HTTP ${resp.status}`);
          return;
        }
        setNotice(
          `${decision === 'APPROVED' ? '批准' : decision === 'REJECTED' ? '拒绝' : '删除'} 已入队 ${data.queued} 条 ` +
            `(跳过 ${data.skipped})。drudge 30s 内消化。`,
        );
        clearSelection();
        setTimeout(() => router.refresh(), 35000);
      } catch (e) {
        setError(e instanceof Error ? e.message : '提交失败');
      }
    });
  }

  const availableTypes = DEPT_TYPES[approveDept] ?? [];

  return (
    <section className="mb-8">
      <SectionTitle>
        待审待办
        <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-rose-200">
          {all.length}
        </span>
      </SectionTitle>

      {/* 工具栏 — sticky 在顶部 */}
      <div className="sticky top-0 z-20 mb-3 -mx-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">
            已选 <span className="text-rose-600">{selected.size}</span> / {all.length}
          </span>

          <label className="flex items-center gap-1 text-slate-600">
            筛选:
            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs"
            >
              <option value="">全部 ({all.length})</option>
              {DEPTS.map((d) => {
                const n = all.filter((p) => p.guessed_dept === d).length;
                return (
                  <option key={d} value={d} disabled={n === 0}>
                    {d} ({n})
                  </option>
                );
              })}
            </select>
          </label>

          <button onClick={selectAllFiltered} className="rounded-md bg-slate-100 px-2 py-1 hover:bg-slate-200">
            全选当前({filtered.length})
          </button>
          <button onClick={invertSelectionFiltered} className="rounded-md bg-slate-100 px-2 py-1 hover:bg-slate-200">
            反选当前
          </button>
          <button
            onClick={clearSelection}
            disabled={selected.size === 0}
            className="rounded-md bg-slate-100 px-2 py-1 hover:bg-slate-200 disabled:opacity-40"
          >
            清空选择
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-slate-500">批准到 →</span>
            <select
              value={approveDept}
              onChange={(e) => {
                setApproveDept(e.target.value);
                setApproveType(DEPT_TYPES[e.target.value]?.[0] ?? '');
              }}
              className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs"
            >
              {DEPTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <select
              value={approveType}
              onChange={(e) => setApproveType(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs"
            >
              {availableTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button
              onClick={() => submit('APPROVED')}
              disabled={isPending || selected.size === 0}
              className="rounded-md bg-emerald-600 px-2.5 py-1 font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              批准 {selected.size > 0 ? selected.size : ''}
            </button>

            <button
              onClick={() => submit('REJECTED')}
              disabled={isPending || selected.size === 0}
              className="rounded-md bg-amber-500 px-2.5 py-1 font-medium text-white hover:bg-amber-600 disabled:opacity-40"
              title="移到 raw/_inbox/_rejected/ (留档不删)"
            >
              拒绝 {selected.size > 0 ? selected.size : ''}
            </button>

            <button
              onClick={() => submit('DELETED')}
              disabled={isPending || selected.size === 0}
              className="rounded-md bg-rose-600 px-2.5 py-1 font-medium text-white hover:bg-rose-700 disabled:opacity-40"
              title="物理删除文件 + sidecar(不可恢复)"
            >
              删除 {selected.size > 0 ? selected.size : ''}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-2 rounded-md bg-rose-50 px-2 py-1.5 text-xs text-rose-700 ring-1 ring-rose-200">
            ⚠ {error}
          </div>
        )}
        {notice && (
          <div className="mt-2 rounded-md bg-emerald-50 px-2 py-1.5 text-xs text-emerald-700 ring-1 ring-emerald-200">
            ✓ {notice}
          </div>
        )}
      </div>

      {filterDept && filtered.length === 0 && (
        <EmptyHint text={`当前筛选「${filterDept}」无条目`} />
      )}

      {/* Mobile cards */}
      <ul className="space-y-2 md:hidden">
        {filtered.map((p) => {
          const checked = selected.has(p.path);
          return (
            <li
              key={p.path}
              className={`rounded-xl border bg-white p-3 ${
                checked ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200'
              }`}
              onClick={() => toggle(p.path)}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(p.path)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1 h-4 w-4 rounded border-slate-300 accent-rose-600"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 break-all font-mono text-xs text-slate-700">
                      {p.path.replace(/^raw\/_inbox\/_pending\//, '')}
                    </div>
                    <ConfidenceBadge value={p.confidence} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <DeptBadge dept={p.guessed_dept} />
                    {p.guessed_type && (
                      <span className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600 ring-1 ring-slate-200">
                        {p.guessed_type}
                      </span>
                    )}
                    {p.tags?.slice(0, 3).map((t) => (
                      <span key={t} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
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
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[40px]" />
            <col className="w-[35%]" />
            <col className="w-[110px]" />
            <col className="w-[110px]" />
            <col />
            <col className="w-[80px]" />
            <col className="w-[110px]" />
          </colgroup>
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2 text-center">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && visibleSelectedCount === filtered.length}
                  ref={(el) => {
                    if (el)
                      el.indeterminate =
                        visibleSelectedCount > 0 && visibleSelectedCount < filtered.length;
                  }}
                  onChange={() => {
                    if (visibleSelectedCount === filtered.length) {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        filtered.forEach((p) => next.delete(p.path));
                        return next;
                      });
                    } else {
                      selectAllFiltered();
                    }
                  }}
                  className="h-4 w-4 rounded border-slate-300 accent-rose-600"
                />
              </th>
              <th className="px-3 py-2 text-left">文件</th>
              <th className="px-3 py-2 text-left">猜的部门</th>
              <th className="px-3 py-2 text-left">猜的类型</th>
              <th className="px-3 py-2 text-left">摘要</th>
              <th className="px-3 py-2 text-right">置信度</th>
              <th className="px-3 py-2 text-right">处理时间</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const checked = selected.has(p.path);
              return (
                <tr
                  key={p.path}
                  className={`border-t border-slate-100 ${
                    checked ? 'bg-rose-50/50' : 'hover:bg-rose-50/20'
                  }`}
                  onClick={() => toggle(p.path)}
                >
                  <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(p.path)}
                      className="h-4 w-4 rounded border-slate-300 accent-rose-600"
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="break-all font-mono text-[11px] leading-snug text-slate-700" title={p.path}>
                      {p.path.replace(/^raw\/_inbox\/_pending\//, '')}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top whitespace-nowrap text-slate-700">
                    <DeptBadge dept={p.guessed_dept} />
                  </td>
                  <td className="px-3 py-2 align-top text-[11px] text-slate-600">
                    {p.guessed_type || <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-slate-600" title={p.summary ?? undefined}>
                    <div className="line-clamp-3 break-words leading-snug">{p.summary}</div>
                  </td>
                  <td className="px-3 py-2 align-top whitespace-nowrap text-right">
                    <ConfidenceBadge value={p.confidence} />
                  </td>
                  <td className="px-3 py-2 align-top whitespace-nowrap text-right text-[11px] text-slate-400">
                    {formatTime(p.processed_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 flex items-center text-base font-semibold text-slate-800">{children}</h2>;
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}
