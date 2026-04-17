'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import FileUpload, { type UploadedFile } from '@/components/FileUpload';

type Props = {
  task: { id: string; status: string; claimantId: string | null };
  me: { id: string; role: 'ADMIN' | 'MEMBER' };
};

export default function TaskActions({ task, me }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isAdmin = me.role === 'ADMIN';
  const isClaimant = task.claimantId === me.id;

  async function claim() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}/claim`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error || '操作失败');
      router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function release() {
    if (!confirm('确认释放该任务？其他人可以重新领取。')) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}/claim`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || '操作失败');
      router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  // States:
  //  OPEN: member/admin can claim
  //  CLAIMED (me): can submit or release
  //  SUBMITTED: awaiting review
  //  REJECTED (me as claimant): can re-submit
  //  APPROVED / ARCHIVED: closed
  const showClaim = task.status === 'OPEN';
  const showMyControls = isClaimant && (task.status === 'CLAIMED' || task.status === 'REJECTED');
  const showAdminRelease = isAdmin && task.status === 'CLAIMED' && !isClaimant;

  if (!showClaim && !showMyControls && !showAdminRelease) return null;

  return (
    <section className="space-y-4 rounded-xl border bg-white p-6">
      {err && <p className="text-sm text-rose-600">{err}</p>}
      {showClaim && (
        <button
          onClick={claim}
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? '…' : '领取任务'}
        </button>
      )}
      {showMyControls && (
        <>
          <SubmitForm taskId={task.id} />
          <button
            onClick={release}
            disabled={busy}
            className="text-sm text-rose-600 hover:underline disabled:opacity-50"
          >
            释放任务
          </button>
        </>
      )}
      {showAdminRelease && (
        <button
          onClick={release}
          disabled={busy}
          className="text-sm text-rose-600 hover:underline disabled:opacity-50"
        >
          管理员释放该任务
        </button>
      )}
    </section>
  );
}

function SubmitForm({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) { setErr('请填写工作说明'); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, attachmentIds: files.map((f) => f.id) }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '提交失败');
      setNote(''); setFiles([]);
      router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3 border-t pt-4">
      <h3 className="text-sm font-medium text-slate-700">提交工作成果</h3>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={4}
        placeholder="描述你完成的工作，附上说明或链接…"
        className="w-full rounded-lg border px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
      />
      <FileUpload onChange={setFiles} />
      {err && <p className="text-sm text-rose-600">{err}</p>}
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {busy ? '提交中…' : '提交审核'}
      </button>
    </form>
  );
}
