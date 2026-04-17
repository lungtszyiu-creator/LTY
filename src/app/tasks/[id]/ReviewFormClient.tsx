'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ReviewFormClient({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function review(decision: 'APPROVED' | 'REJECTED') {
    if (decision === 'REJECTED' && !note.trim()) {
      setErr('驳回请填写理由');
      return;
    }
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: note.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '操作失败');
      router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="mt-4 space-y-2 border-t pt-4">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="审核意见（通过可不填；驳回必填）"
        className="w-full rounded-lg border px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
      />
      {err && <p className="text-sm text-rose-600">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => review('APPROVED')}
          disabled={busy}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          通过
        </button>
        <button
          onClick={() => review('REJECTED')}
          disabled={busy}
          className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
        >
          驳回
        </button>
      </div>
    </div>
  );
}
