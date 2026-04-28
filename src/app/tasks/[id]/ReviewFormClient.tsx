'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Decision = 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED';

export default function ReviewFormClient({
  submissionId,
  submitterId,
  meId,
  taskPoints,
  suggestedPenaltyPoints,
}: {
  submissionId: string;
  submitterId: string;
  meId: string;
  taskPoints: number;
  suggestedPenaltyPoints: number;
}) {
  const router = useRouter();
  const [note, setNote] = useState('');
  // Default award = full task points; reviewer can lower for partial credit.
  const [awardedPoints, setAwardedPoints] = useState<string>(String(taskPoints));
  const [recordAsFailure, setRecordAsFailure] = useState(false);
  const [penaltyPoints, setPenaltyPoints] = useState(suggestedPenaltyPoints);
  const [busy, setBusy] = useState<null | Decision>(null);
  const [err, setErr] = useState<string | null>(null);

  if (submitterId === meId) {
    return (
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-800">
        ⚠️ 你是该提交的作者，不能自审。请让另一位管理员审核。
      </div>
    );
  }

  async function review(decision: Decision) {
    if ((decision === 'REJECTED' || decision === 'REVISION_REQUESTED') && !note.trim()) {
      setErr(decision === 'REJECTED' ? '驳回请填写理由' : '请说明需要修改的地方');
      return;
    }
    let parsedAward: number | undefined;
    if (decision === 'APPROVED') {
      const n = Number(awardedPoints);
      if (!Number.isFinite(n) || n < 0) {
        setErr('实际积分必须 ≥ 0');
        return;
      }
      parsedAward = n;
    }
    setBusy(decision); setErr(null);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          note: note.trim() || undefined,
          ...(decision === 'APPROVED' && parsedAward != null ? { awardedPoints: parsedAward } : {}),
          ...(decision === 'REJECTED' && recordAsFailure
            ? { recordAsFailure: true, penaltyPoints }
            : {}),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '操作失败');
      router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }

  const partialQuick = [taskPoints, taskPoints * 0.75, taskPoints * 0.5, taskPoints * 0.25, 0]
    .map((n) => Math.round(n * 100) / 100)
    .filter((v, i, arr) => arr.indexOf(v) === i); // dedupe

  return (
    <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">审核</div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="审核意见（通过可不填；要求修改 / 驳回必填）"
        className="textarea"
      />

      {/* Partial-credit input — visible only relevant to APPROVED. Big
          decimal input + quick-fill chips for common percentages. */}
      <div className="rounded-lg bg-white px-3 py-2.5 ring-1 ring-slate-200">
        <div className="mb-1.5 flex items-center gap-2 text-xs">
          <span className="font-medium text-slate-700">实际给分（通过时生效）</span>
          <span className="text-slate-400">满分 {taskPoints} 分</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            step="0.5"
            min={0}
            max={99999}
            value={awardedPoints}
            onChange={(e) => setAwardedPoints(e.target.value)}
            className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-semibold tabular-nums"
          />
          <span className="text-xs text-slate-500">分</span>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs text-slate-500">快捷：</span>
          {partialQuick.map((q) => {
            const on = Number(awardedPoints) === q;
            return (
              <button
                key={q}
                type="button"
                onClick={() => setAwardedPoints(String(q))}
                className={`rounded-full px-2.5 py-0.5 text-[11px] transition ${
                  on ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
                }`}
              >
                {q}
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 text-[11px] text-slate-500">支持小数（例如 7.5）。0 = 通过但不给分。</div>
      </div>

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

      {err && <p className="text-xs text-rose-600">⚠️ {err}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          onClick={() => review('APPROVED')}
          disabled={!!busy}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-white shadow-[0_8px_20px_-6px_rgba(5,150,105,0.45)] transition disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #34d399 0%, #059669 55%, #047857 100%)' }}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          {busy === 'APPROVED' ? '通过中…' : `通过（${awardedPoints || 0} 分）`}
        </button>
        <button
          onClick={() => review('REVISION_REQUESTED')}
          disabled={!!busy}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-medium text-white shadow-[0_8px_20px_-6px_rgba(217,119,6,0.45)] transition hover:bg-amber-600 disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          {busy === 'REVISION_REQUESTED' ? '提交中…' : '要求修改'}
        </button>
        <button
          onClick={() => review('REJECTED')}
          disabled={!!busy}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-white shadow-[0_8px_20px_-6px_rgba(225,29,72,0.4)] transition disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #fb7185 0%, #e11d48 55%, #9f1239 100%)' }}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          {busy === 'REJECTED' ? '驳回中…' : '驳回'}
        </button>
      </div>
    </div>
  );
}
