'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ReviewFormClient({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<null | 'APPROVED' | 'REJECTED'>(null);
  const [err, setErr] = useState<string | null>(null);

  async function review(decision: 'APPROVED' | 'REJECTED') {
    if (decision === 'REJECTED' && !note.trim()) {
      setErr('驳回请填写理由');
      return;
    }
    setBusy(decision); setErr(null);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: note.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '操作失败');
      router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">审核</div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="审核意见（通过可不填；驳回必填）"
        className="textarea"
      />
      {err && <p className="text-xs text-rose-600">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => review('APPROVED')}
          disabled={!!busy}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          {busy === 'APPROVED' ? '通过中…' : '通过'}
        </button>
        <button
          onClick={() => review('REJECTED')}
          disabled={!!busy}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3.5 py-2 text-sm font-medium text-rose-600 shadow-sm transition hover:bg-rose-50 disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          {busy === 'REJECTED' ? '驳回中…' : '驳回'}
        </button>
      </div>
    </div>
  );
}
