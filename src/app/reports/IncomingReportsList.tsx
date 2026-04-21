'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fmtDateTime } from '@/lib/datetime';

type Item = {
  id: string;
  periodLabel: string;
  status: string;
  submittedAt: string | null;
  readAtByReporter: string | null;
  contentDone: string | null;
  contentPlan: string | null;
  contentBlockers: string | null;
  contentAsks: string | null;
  author: { id: string; name: string | null; email: string; image: string | null };
};

function initialOf(s: string | null | undefined) {
  return (s || '?').slice(0, 1).toUpperCase();
}

export default function IncomingReportsList({ items: initial }: { items: Item[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function markRead(id: string) {
    setBusyId(id); setErr(null);
    try {
      const res = await fetch(`/api/reports/${id}/read`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? '标记失败');
      }
      const payload = await res.json();
      const readAt = payload.readAt ?? new Date().toISOString();
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, readAtByReporter: readAt } : it)));
      // Tell Nav to re-fetch /api/me/badges right now so the red dot drops
      // immediately instead of waiting for the 60s poll / next navigation.
      window.dispatchEvent(new CustomEvent('badges:refresh'));
      router.refresh();
    } catch (e: any) {
      setErr(e.message || '标记失败');
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="card py-14 text-center text-sm text-slate-500">
        暂时没有人把你设为他们的汇报对象
      </div>
    );
  }

  const unreadCount = items.filter((i) => !i.readAtByReporter).length;

  return (
    <div>
      {unreadCount > 0 && (
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs text-rose-800 ring-1 ring-rose-200">
          🔴 还有 <strong>{unreadCount}</strong> 份未阅 · 逐条点"✓ 已阅"把红点消掉
        </div>
      )}
      {err && <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">⚠️ {err}</div>}

      <ul className="space-y-2">
        {items.map((r) => {
          const unread = !r.readAtByReporter;
          return (
            <li key={r.id} className={`card p-4 ${unread ? 'ring-2 ring-rose-300' : ''}`}>
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                  {unread && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                      NEW
                    </span>
                  )}
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-300 to-fuchsia-300 text-xs font-semibold text-white">
                    {initialOf(r.author.name ?? r.author.email)}
                  </span>
                  <span className="font-medium">{r.author.name ?? r.author.email}</span>
                  <span className="text-xs text-slate-500">· {r.periodLabel}</span>
                  {r.submittedAt && <span className="text-xs text-slate-400">· {fmtDateTime(r.submittedAt)}</span>}
                  {r.status === 'LATE' && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200">逾期</span>}
                  {!unread && (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 ring-1 ring-emerald-200">
                      ✓ 已阅 {r.readAtByReporter && `· ${fmtDateTime(r.readAtByReporter)}`}
                    </span>
                  )}
                </summary>
                <div className="mt-3 space-y-2 pl-9">
                  {r.contentDone && <Block label="本期完成" value={r.contentDone} />}
                  {r.contentPlan && <Block label="下期计划" value={r.contentPlan} />}
                  {r.contentBlockers && <Block label="遇到问题" value={r.contentBlockers} />}
                  {r.contentAsks && <Block label="需要支持" value={r.contentAsks} />}
                  {!r.contentDone && !r.contentPlan && !r.contentBlockers && !r.contentAsks && (
                    <div className="text-center text-xs text-slate-400">（未填写内容）</div>
                  )}
                  {unread && (
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); markRead(r.id); }}
                        disabled={busyId === r.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {busyId === r.id ? '标记中…' : '✓ 已阅'}
                      </button>
                    </div>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Block({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-100">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{value}</div>
    </div>
  );
}
