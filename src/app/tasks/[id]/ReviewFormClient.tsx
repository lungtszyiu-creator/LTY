'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ReviewFormClient({
  submissionId,
  submitterId,
  meId,
  suggestedPenaltyPoints,
}: {
  submissionId: string;
  submitterId: string;
  meId: string;
  suggestedPenaltyPoints: number;
}) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [recordAsFailure, setRecordAsFailure] = useState(false);
  const [penaltyPoints, setPenaltyPoints] = useState(suggestedPenaltyPoints);
  const [busy, setBusy] = useState<null | 'APPROVED' | 'REJECTED'>(null);
  const [err, setErr] = useState<string | null>(null);

  // Reviewer cannot be the submitter. Hide the form entirely so the UI matches
  // the server-side guard in /api/submissions/[id]/review.
  if (submitterId === meId) {
    return (
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-800">
        ⚠️ 你是该提交的作者，不能自审。请让另一位管理员审核。
      </div>
    );
  }

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
        body: JSON.stringify({
          decision,
          note: note.trim() || undefined,
          ...(decision === 'REJECTED' && recordAsFailure
            ? { recordAsFailure: true, penaltyPoints }
            : {}),
        }),
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

      <label className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-xs text-rose-800 ring-1 ring-rose-200">
        <input
          type="checkbox"
          checked={recordAsFailure}
          onChange={(e) => setRecordAsFailure(e.target.checked)}
          className="mt-0.5"
        />
        <span className="flex-1">
          <span className="font-medium">记录为失败浪费 · 扣罚积分（仅驳回时生效）</span>
          <span className="mt-0.5 block opacity-80">领取任务后未按要求交付，或浪费他人时间。该记录将计入战功榜负分，影响年度考核。</span>
          {recordAsFailure && (
            <span className="mt-2 flex items-center gap-2">
              <span className="opacity-80">扣除</span>
              <input
                type="number"
                min={1}
                max={9999}
                value={penaltyPoints}
                onChange={(e) => setPenaltyPoints(Math.max(1, Math.min(9999, Number(e.target.value))))}
                className="w-20 rounded-md border border-rose-200 bg-white px-2 py-1 text-xs"
              />
              <span className="opacity-80">积分（建议 2 倍：{suggestedPenaltyPoints}）</span>
            </span>
          )}
        </span>
      </label>

      {err && <p className="text-xs text-rose-600">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => review('APPROVED')}
          disabled={!!busy}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-white shadow-[0_8px_20px_-6px_rgba(5,150,105,0.45),inset_0_1px_0_rgba(255,255,255,0.25)] transition hover:shadow-[0_12px_28px_-6px_rgba(5,150,105,0.55),inset_0_1px_0_rgba(255,255,255,0.25)] disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #34d399 0%, #059669 55%, #047857 100%)' }}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          {busy === 'APPROVED' ? '通过中…' : '通过'}
        </button>
        <button
          onClick={() => review('REJECTED')}
          disabled={!!busy}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-white shadow-[0_8px_20px_-6px_rgba(225,29,72,0.4),inset_0_1px_0_rgba(255,255,255,0.2)] transition hover:shadow-[0_12px_28px_-6px_rgba(225,29,72,0.5),inset_0_1px_0_rgba(255,255,255,0.2)] disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #fb7185 0%, #e11d48 55%, #9f1239 100%)' }}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          {busy === 'REJECTED' ? '驳回中…' : '驳回'}
        </button>
      </div>
    </div>
  );
}
