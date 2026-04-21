'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function InstanceActions({ instanceId, stepId }: { instanceId: string; stepId: string }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<null | 'APPROVED' | 'REJECTED'>(null);
  const [err, setErr] = useState<string | null>(null);

  async function act(decision: 'APPROVED' | 'REJECTED') {
    if (decision === 'REJECTED' && !note.trim()) { setErr('驳回请填写理由'); return; }
    setBusy(decision); setErr(null);
    try {
      const res = await fetch(`/api/approvals/${instanceId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepId, decision, note: note.trim() || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '操作失败');
      router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }

  return (
    <section className="card p-5 ring-2 ring-amber-300">
      <div className="mb-3">
        <div className="text-sm font-semibold">⏰ 你的审批</div>
        <div className="text-xs text-slate-500">请仔细查看上方内容，做出决定</div>
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="审批意见（通过可不填；驳回必填）"
        className="textarea"
      />
      {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => act('APPROVED')}
          disabled={!!busy}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-white shadow transition disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #34d399 0%, #059669 55%, #047857 100%)' }}
        >
          {busy === 'APPROVED' ? '通过中…' : '✓ 通过'}
        </button>
        <button
          onClick={() => act('REJECTED')}
          disabled={!!busy}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-white shadow transition disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #fb7185 0%, #e11d48 55%, #9f1239 100%)' }}
        >
          {busy === 'REJECTED' ? '驳回中…' : '× 驳回'}
        </button>
      </div>
    </section>
  );
}
