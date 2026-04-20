'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import FileUpload, { type UploadedFile } from '@/components/FileUpload';

type Role = 'SUPER_ADMIN' | 'ADMIN' | 'MEMBER';

type Props = {
  task: {
    id: string;
    title: string;
    status: string;
    claimantId: string | null;
    allowMultiClaim: boolean;
    myClaimActive: boolean; // true if current user has an unreleased TaskClaim (multi-claim)
  };
  me: { id: string; role: Role };
};

export default function TaskActions({ task, me }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [claimed, setClaimed] = useState(false);

  const isAdmin = me.role === 'ADMIN' || me.role === 'SUPER_ADMIN';
  const isClaimant = task.allowMultiClaim ? task.myClaimActive : task.claimantId === me.id;

  async function claim() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}/claim`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as any));
        if (body?.error === 'TOO_MANY_CLAIMS') {
          throw new Error(`同时进行中任务不能超过 ${body.limit ?? 3} 条，请先完成或释放一条`);
        }
        throw new Error(body.error || '操作失败');
      }
      setConfirmOpen(false);
      setClaimed(true);
      // Refresh immediately so the UI reflects the new state. Modal stays open
      // for a brief success moment but navigation/state doesn't wait.
      router.refresh();
      setTimeout(() => setClaimed(false), 1400);
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

  // Single-claim: OPEN means nobody took it yet. Multi-claim: status stays OPEN
  // until a winner is picked; anyone who hasn't claimed can still claim.
  const showClaim = task.allowMultiClaim
    ? (task.status === 'OPEN' || task.status === 'SUBMITTED') && !isClaimant
    : task.status === 'OPEN';
  const showMyControls = isClaimant && (
    task.allowMultiClaim
      ? task.status !== 'APPROVED' && task.status !== 'ARCHIVED'
      : task.status === 'CLAIMED' || task.status === 'REJECTED'
  );
  const showAdminRelease = isAdmin
    && !isClaimant
    && !task.allowMultiClaim
    && task.status === 'CLAIMED';

  if (!showClaim && !showMyControls && !showAdminRelease) return null;

  return (
    <>
      {/* Prominent release strip for the current claimant, always visible at
          the top of the actions card — fixes "no way to exit after claiming". */}
      {isClaimant && (
        <section className="card rise flex items-center justify-between gap-3 p-4 ring-1 ring-amber-200">
          <div className="flex items-center gap-2.5 text-sm">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </span>
            <span className="text-slate-700">
              你已领取这条任务
              {task.allowMultiClaim && <span className="ml-1 text-slate-400">· 多人共享模式</span>}
            </span>
          </div>
          <button
            onClick={release}
            disabled={busy}
            className="btn btn-ghost text-sm text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-50"
          >
            {busy ? '处理中…' : '释放任务'}
          </button>
        </section>
      )}

      <section className="card rise rise-delay-1 p-6">
        {err && !confirmOpen && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
            {err}
          </div>
        )}

        {showClaim && (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">
                {task.allowMultiClaim ? '多人共享任务 · 欢迎加入' : '这条任务还在等待认领'}
              </div>
              <div className="text-xs text-slate-500">
                {task.allowMultiClaim
                  ? '所有领取人都可以提交方案，管理员审核时选最优方案给分。'
                  : '点击下方按钮确认领取，领取后可开始处理'}
              </div>
            </div>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={busy}
              className="btn btn-primary"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              领取任务
            </button>
          </div>
        )}

        {showMyControls && (
          <SubmitForm
            taskId={task.id}
            onRelease={release}
            busy={busy}
            multi={task.allowMultiClaim}
          />
        )}

        {showAdminRelease && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">当前任务已被领取</div>
            <button onClick={release} disabled={busy} className="btn btn-ghost text-rose-600">
              管理员释放该任务
            </button>
          </div>
        )}
      </section>

      {(confirmOpen || claimed) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => !claimed && !busy && setConfirmOpen(false)}
          />
          <div className="rise relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
            {!claimed ? (
              <>
                <div className="p-6">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-sky-100">
                    <svg className="h-5 w-5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  </div>
                  <h3 className="text-base font-semibold">确认领取这条任务？</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                    「{task.title}」
                  </p>
                  <p className="mt-3 text-xs text-slate-500">
                    {task.allowMultiClaim
                      ? '这是一条多人共享任务。领取后可开始工作，提交方案后等管理员审核选优。'
                      : '领取后你是唯一负责人，完成工作后点击提交审核。也可以随时释放任务让其他人领取。'}
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
                    onClick={claim}
                    disabled={busy}
                    className="btn btn-primary flex-1 justify-center"
                  >
                    {busy ? '领取中…' : '确认领取'}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
                <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                  <span className="absolute inset-0 animate-ping rounded-full bg-emerald-300 opacity-40" />
                  <svg className="relative h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
                <div>
                  <div className="text-base font-semibold">领取成功</div>
                  <div className="mt-1 text-sm text-slate-500">开始处理吧，完成后记得提交</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SubmitForm({ taskId, onRelease, busy, multi }: { taskId: string; onRelease: () => void; busy: boolean; multi: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) { setErr('请填写工作说明'); return; }
    setSubmitting(true); setErr(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, attachmentIds: files.map((f) => f.id) }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '提交失败');
      setSuccess(true);
      setNote(''); setFiles([]);
      router.refresh();
      setTimeout(() => setSuccess(false), 1600);
    } catch (e: any) { setErr(e.message); } finally { setSubmitting(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">提交工作成果</h3>
          <p className="text-xs text-slate-500">
            {multi
              ? '多人任务：你可以多次提交方案，管理员将在所有方案中选最优'
              : '描述你完成的工作 + 附上交付物，管理员会尽快审核'}
          </p>
        </div>
        <button type="button" onClick={onRelease} disabled={busy} className="text-xs text-slate-400 hover:text-rose-600">
          释放任务
        </button>
      </div>

      <div>
        <label className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-700">工作说明</span>
          <span className="text-xs text-slate-400">{note.length}/5000</span>
        </label>
        <textarea
          value={note} onChange={(e) => setNote(e.target.value)} rows={5} maxLength={5000}
          placeholder="例如：已按需求整理完 37 份反馈，分类结果见附件；额外发现 3 个 bug 已提交 GitHub。"
          className="textarea"
        />
      </div>

      <FileUpload onChange={setFiles} label="上传交付物" />

      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
          {err}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button type="submit" disabled={submitting || !note.trim()} className="btn btn-primary disabled:opacity-50">
          {success ? (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              已提交
            </>
          ) : submitting ? (
            <>
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" /><path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" /></svg>
              提交中
            </>
          ) : (
            <>提交审核</>
          )}
        </button>
      </div>
    </form>
  );
}
