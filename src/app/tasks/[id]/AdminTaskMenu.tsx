'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export default function AdminTaskMenu({ taskId, taskTitle }: { taskId: string; taskTitle: string }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) {
      document.addEventListener('mousedown', onDoc);
      return () => document.removeEventListener('mousedown', onDoc);
    }
  }, [menuOpen]);

  async function del() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json()).error || '删除失败');
      router.push('/dashboard');
      router.refresh();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <>
      <div ref={wrapRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="更多操作"
          aria-expanded={menuOpen}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-amber-100/40 hover:text-slate-900"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg rise">
            <button
              type="button"
              onClick={() => { setMenuOpen(false); setConfirmOpen(true); }}
              className="flex w-full items-center gap-2 px-3.5 py-2.5 text-sm text-rose-600 transition hover:bg-rose-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" /></svg>
              删除任务
            </button>
          </div>
        )}
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => !busy && setConfirmOpen(false)}
          />
          <div className="rise relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="p-6">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
                <svg className="h-5 w-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M4.93 4.93l14.14 14.14M5 13h14" /></svg>
              </div>
              <h3 className="text-base font-semibold">确认删除这条任务？</h3>
              <p className="mt-1 line-clamp-2 text-sm text-slate-500">「{taskTitle}」</p>
              <p className="mt-3 text-xs text-slate-500">
                此操作无法撤销。所有相关的提交记录、附件索引会被一并删除。
              </p>
              {err && <p className="mt-3 text-sm text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 border-t border-slate-100 px-6 py-4">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={busy}
                className="btn btn-ghost flex-1 justify-center"
              >
                取消
              </button>
              <button
                onClick={del}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-[0_8px_20px_-6px_rgba(225,29,72,0.45),inset_0_1px_0_rgba(255,255,255,0.2)] transition hover:shadow-[0_12px_28px_-6px_rgba(225,29,72,0.55),inset_0_1px_0_rgba(255,255,255,0.2)] disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #fb7185 0%, #e11d48 55%, #9f1239 100%)' }}
              >
                {busy ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
