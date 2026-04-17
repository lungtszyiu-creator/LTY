'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import FileUpload, { type UploadedFile } from '@/components/FileUpload';

export default function NewTaskForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reward, setReward] = useState('');
  const [deadline, setDeadline] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const body: any = {
        title, description,
        reward: reward || null,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        attachmentIds: files.map((f) => f.id),
      };
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || '发布失败');
      const task = await res.json();
      router.push(`/tasks/${task.id}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  const chars = description.length;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <form onSubmit={submit} className="card rise space-y-5 p-6">
        <div>
          <label className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-800">
              标题 <span className="text-rose-500">*</span>
            </span>
          </label>
          <input
            value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={100}
            placeholder="例如：整理本周客户反馈"
            className="input"
          />
        </div>

        <div>
          <label className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-800">
              任务说明 <span className="text-rose-500">*</span>
            </span>
            <span className="text-xs text-slate-400">{chars}/5000</span>
          </label>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={5000}
            rows={8}
            placeholder="清晰描述任务目标、验收标准、参考资料。"
            className="textarea"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">奖励</label>
            <input
              value={reward} onChange={(e) => setReward(e.target.value)}
              placeholder="￥100 · 奶茶一杯 · 调休半天"
              className="input"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">截止时间</label>
            <input
              type="datetime-local"
              value={deadline} onChange={(e) => setDeadline(e.target.value)}
              className="input"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-800">参考附件</label>
          <FileUpload onChange={setFiles} />
        </div>

        {err && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
            {err}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 pt-5">
          <p className="text-xs text-slate-500">
            💌 发布后将自动邮件通知所有成员
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => router.back()} className="btn btn-ghost">取消</button>
            <button type="submit" disabled={busy || !title || !description} className="btn btn-primary disabled:opacity-50">
              {busy ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" /><path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" /></svg>
                  发布中
                </>
              ) : (
                <>发布任务</>
              )}
            </button>
          </div>
        </div>
      </form>

      <aside className="rise rise-delay-1 lg:sticky lg:top-20 lg:self-start">
        <div className="mb-2 px-1 text-xs uppercase tracking-wider text-slate-400">看板预览</div>
        <div className="card p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs text-sky-700 ring-1 ring-sky-200">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
              待领取
            </span>
            {reward && (
              <div className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                {reward}
              </div>
            )}
          </div>
          <h3 className="mb-1.5 text-base font-semibold tracking-tight">
            {title || <span className="text-slate-300">标题会显示在这里</span>}
          </h3>
          <p className="mb-4 line-clamp-3 text-sm leading-relaxed text-slate-500 min-h-[60px]">
            {description || <span className="text-slate-300">任务说明会显示在这里</span>}
          </p>
          {deadline && (
            <div className="inline-flex items-center gap-1 text-xs text-slate-500">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {new Date(deadline).toLocaleString('zh-CN')}
            </div>
          )}
        </div>

        <ul className="mt-5 space-y-3 px-1 text-xs text-slate-500">
          <li className="flex gap-2">
            <span className="mt-0.5 text-slate-400">①</span>
            <span>填写清晰的标题和可验收的标准，减少沟通成本。</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 text-slate-400">②</span>
            <span>奖励写得越具体，成员动力越高（金额、物品或时间均可）。</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 text-slate-400">③</span>
            <span>发布后成员会收到邮件，且可在看板直接领取。</span>
          </li>
        </ul>
      </aside>
    </div>
  );
}
