'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Admin-only "撤回审核" button. Calls DELETE on the review endpoint to
// roll the submission back to PENDING and undo any auto-created reward
// or penalty. Used when a reviewer clicked the wrong button or wants to
// reconsider after gathering more info.
export default function UndoReviewButton({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function undo() {
    if (!confirm('撤回此次审核？将回到"待审核"状态，已生成的奖励/扣罚记录会一并撤销。')) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/review`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? '撤回失败');
      }
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={undo}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
        {busy ? '撤回中…' : '撤回审核'}
      </button>
      {err && <p className="mt-1 text-xs text-rose-600">⚠️ {err}</p>}
    </div>
  );
}
