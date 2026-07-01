'use client';

/**
 * T3 · 知识审核面板（薄壳 UI）。
 * 所有按钮只 POST /api/knowledge/kb-action，前端不含任何状态逻辑，
 * 不碰 status / cite_allowed / commit_hash（全由 kb_action.py 决定）。
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { KbItem } from '@/lib/kb-actions';

const STATUS_ZH: Record<string, string> = {
  dept_review: '待部门审核',
  steward_finalize: '待管家定版',
  commit_failed: '入库失败-待重试',
  need_info: '待补信息',
  published: '已发布',
};
const PERMS = ['public', 'dept_internal', 'confidential', 'top_secret'];

export default function KbReviewPanel({
  items,
  isSuperAdmin,
}: {
  items: KbItem[];
  isSuperAdmin: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-sm text-slate-400">
        🎉 没有待处理的知识条目。
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <KbRow key={it.file} item={it} isSuperAdmin={isSuperAdmin} />
      ))}
    </div>
  );
}

function KbRow({ item, isSuperAdmin }: { item: KbItem; isSuperAdmin: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [owner, setOwner] = useState(item.owner ?? '');
  const [permission, setPermission] = useState(item.permission ?? 'dept_internal');
  const [version, setVersion] = useState(item.version ?? 'v1');

  async function call(action: string, extra: Record<string, string> = {}) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/knowledge/kb-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, file: item.file, ...extra }),
      });
      const j = (await res.json()) as Record<string, unknown>;
      if (j.ok) {
        const parts = [`✅ ${STATUS_ZH[j.status as string] ?? j.status}`];
        if (j.commit_hash) parts.push(`commit ${String(j.commit_hash).slice(0, 8)}`);
        if (j.cite_allowed === true) parts.push('可引用');
        setMsg({ ok: true, text: parts.join(' · ') });
        setTimeout(() => router.refresh(), 900);
      } else {
        setMsg({ ok: false, text: `❌ ${j.error ?? '失败'}${j.status ? `（${STATUS_ZH[j.status as string] ?? j.status}）` : ''}` });
        if (j.status) setTimeout(() => router.refresh(), 900);
      }
    } catch (e) {
      setMsg({ ok: false, text: `❌ ${e instanceof Error ? e.message : '网络错误'}` });
    } finally {
      setBusy(false);
    }
  }

  function reject() {
    const reason = window.prompt('驳回原因（必填）：')?.trim();
    if (!reason) {
      setMsg({ ok: false, text: '❌ 驳回必须填原因' });
      return;
    }
    void call('reject', { reason });
  }

  const name = item.file.split('/').pop() ?? item.file;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-slate-700" title={item.file}>{name}</div>
          {item.summary && <div className="mt-0.5 break-words text-[11px] text-slate-500">{item.summary}</div>}
        </div>
        <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200">
          {STATUS_ZH[item.status] ?? item.status}
        </span>
      </div>

      {/* 定版字段（管家改） */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <label className="text-[10px] text-slate-400">owner</label>
        <input value={owner} onChange={(e) => setOwner(e.target.value)} className="w-28 rounded border border-slate-300 px-1 py-0.5 text-[11px]" />
        <label className="text-[10px] text-slate-400">权限</label>
        <select value={permission} onChange={(e) => setPermission(e.target.value)} className="rounded border border-slate-300 px-1 py-0.5 text-[11px]">
          {PERMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="text-[10px] text-slate-400">版本</label>
        <input value={version} onChange={(e) => setVersion(e.target.value)} className="w-14 rounded border border-slate-300 px-1 py-0.5 text-[11px]" />
        <button type="button" disabled={busy} onClick={() => call('setfields', { owner, permission, version })}
          className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50">
          保存字段
        </button>
      </div>

      {/* 动作按钮 */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {item.status === 'dept_review' && (
          <>
            <button type="button" disabled={busy} onClick={() => call('confirm')}
              className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              确认有效
            </button>
            <button type="button" disabled={busy} onClick={reject}
              className="rounded border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50">
              驳回
            </button>
          </>
        )}
        {(item.status === 'steward_finalize' || item.status === 'commit_failed') && (
          <button type="button" disabled={busy || !isSuperAdmin} title={isSuperAdmin ? '' : '仅管家可发布'}
            onClick={() => call('publish')}
            className="rounded bg-violet-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-violet-700 disabled:opacity-50">
            {item.status === 'commit_failed' ? '重试发布入库' : '发布入库'}
          </button>
        )}
      </div>

      {msg && (
        <div className={`mt-1.5 text-[11px] ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{msg.text}</div>
      )}
    </div>
  );
}
