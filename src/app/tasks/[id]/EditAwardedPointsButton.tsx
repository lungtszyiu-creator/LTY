'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Admin-only "改积分" inline editor for already-APPROVED submissions.
// Click it → number input appears with the current awarded value (or
// task.points fallback) → save calls PATCH /api/submissions/[id]/award-points.
// Used to retro-fix historical entries where the reviewer wrote "13.4"
// in their notes but the system still showed the nominal 14.
export default function EditAwardedPointsButton({
  submissionId,
  initial,
  taskPoints,
}: {
  submissionId: string;
  initial: number | null;
  taskPoints: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState<string>(String(initial ?? taskPoints));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0) {
      setErr('积分必须 ≥ 0');
      return;
    }
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/award-points`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ awardedPoints: n }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? '保存失败');
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
        className="ml-2 inline-flex items-center gap-1 rounded border border-emerald-300 bg-white px-1.5 py-0.5 text-[10px] text-emerald-700 hover:bg-emerald-50"
        title="修改实际给分（同步到我的奖励 + 战功榜）"
      >
        ✎ 改
      </button>
    );
  }

  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-1.5 py-0.5 text-xs">
      <input
        type="number"
        step="0.1"
        min={0}
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setOpen(false); }}
        className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-semibold tabular-nums focus:border-emerald-400 focus:outline-none"
      />
      <span className="text-[10px] text-slate-500">分</span>
      <button
        onClick={save}
        disabled={busy}
        className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy ? '…' : '保存'}
      </button>
      <button onClick={() => setOpen(false)} className="text-[10px] text-slate-400 hover:text-slate-700">取消</button>
      {err && <span className="text-[10px] text-rose-600">⚠ {err}</span>}
    </span>
  );
}
