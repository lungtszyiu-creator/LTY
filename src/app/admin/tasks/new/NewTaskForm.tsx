'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import FileUpload, { type UploadedFile } from '@/components/FileUpload';
import { PRIORITY_META, type Priority } from '@/lib/constants';

const PRIORITIES: Priority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

export default function NewTaskForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reward, setReward] = useState('');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState<Priority>('NORMAL');
  const [points, setPoints] = useState<number>(10);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function selectPriority(p: Priority) {
    setPriority(p);
    setPoints(Number(PRIORITY_META[p].pointsHint));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const body: any = {
        title, description, priority, points,
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

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-800">优先级</label>
          <div className="grid grid-cols-4 gap-2">
            {PRIORITIES.map((p) => {
              const m = PRIORITY_META[p];
              const active = priority === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => selectPriority(p)}
                  className={`relative flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-xs transition ${
                    active
                      ? `${m.bg} ring-2 ${m.ring} ${m.text}`
                      : 'bg-white ring-1 ring-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${m.dot} ${active && p === 'URGENT' ? 'urgent-pulse' : ''}`} />
                  <span className={active ? 'font-medium' : ''}>{m.label}</span>
                  <span className="text-[10px] opacity-60">{m.pointsHint}分</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">积分</label>
            <input
              type="number" min={0} max={999}
              value={points} onChange={(e) => setPoints(Math.max(0, Math.min(999, Number(e.target.value))))}
              className="input"
            />
            <p className="mt-1 text-xs text-slate-400">完成并通过后计入领取人</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">奖励描述</label>
            <input
              value={reward} onChange={(e) => setReward(e.target.value)}
              placeholder="￥100 · 奶茶一杯"
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
        <div className="card relative overflow-hidden p-5">
          <div className="accent-bar absolute inset-x-0 top-0 h-0.5 opacity-70" />
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs text-sky-700 ring-1 ring-sky-200">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                待领取
              </span>
              {priority !== 'NORMAL' && (
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs ring-1 ${PRIORITY_META[priority].bg} ${PRIORITY_META[priority].text} ${PRIORITY_META[priority].ring}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_META[priority].dot} ${priority === 'URGENT' ? 'urgent-pulse' : ''}`} />
                  {PRIORITY_META[priority].label}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-900/5 px-1.5 py-0.5 text-xs font-semibold text-slate-700">
                {points}<span className="text-[10px] font-normal opacity-60">分</span>
              </span>
              {reward && (
                <div className="reward-chip rounded-lg px-2.5 py-1 text-xs">
                  {reward}
                </div>
              )}
            </div>
          </div>
          <h3 className="mb-1.5 text-base font-semibold tracking-tight">
            {title || <span className="text-slate-300">标题会显示在这里</span>}
          </h3>
          <p className="mb-4 line-clamp-3 min-h-[60px] text-sm leading-relaxed text-slate-500">
            {description || <span className="text-slate-300">任务说明会显示在这里</span>}
          </p>
          {deadline && (
            <div className="inline-flex items-center gap-1 text-xs text-slate-500">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {new Date(deadline).toLocaleString('zh-CN')}
            </div>
          )}
        </div>

        <ul className="mt-5 space-y-2.5 px-1 text-xs text-slate-500">
          <li className="flex gap-2">
            <span className="mt-0.5 text-slate-400">①</span>
            <span>优先级决定建议积分；积分会累计到排行榜，驱动成员投入。</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 text-slate-400">②</span>
            <span>紧急任务自带脉动红光，不会被错过。</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 text-slate-400">③</span>
            <span>每人同时最多 3 条进行中任务，防止占坑。</span>
          </li>
        </ul>
      </aside>
    </div>
  );
}
