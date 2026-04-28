'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Lets the original submitter edit their note and re-submit when the
// reviewer asked for revisions. Hidden by default; click "修改并重新提交"
// to expand into an inline form. Server flips status back to PENDING and
// task back to SUBMITTED so reviewer's queue picks it up again.
export default function ReviseSubmissionClient({
  submissionId,
  initialNote,
}: {
  submissionId: string;
  initialNote: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!note.trim()) {
      setErr('请填写更新后的内容');
      return;
    }
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/submissions/${submissionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? '提交失败');
      }
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-amber-600"
      >
        ✏️ 修改并重新提交
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
      <div className="text-xs font-medium uppercase tracking-wider text-amber-900">修改提交内容</div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={5}
        placeholder="按审核意见调整后写在这里"
        className="textarea bg-white"
      />
      {err && <p className="text-xs text-rose-600">⚠️ {err}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="btn btn-ghost text-xs">取消</button>
        <button
          onClick={submit}
          disabled={busy}
          className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {busy ? '提交中…' : '重新提交'}
        </button>
      </div>
    </div>
  );
}
