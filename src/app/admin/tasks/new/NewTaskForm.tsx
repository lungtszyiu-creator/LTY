'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import FileUpload, { type UploadedFile } from '@/components/FileUpload';
import {
  PRIORITY_META, type Priority,
  CONTRIBUTION_META, type Contribution,
  CORE_DUTY_WARNING_KEYWORDS,
} from '@/lib/constants';

const PRIORITIES: Priority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const CONTRIBUTIONS: Contribution[] = ['CROSS_TEAM', 'PROCESS', 'KNOWLEDGE', 'FIREFIGHT', 'EXTERNAL', 'GROWTH', 'OTHER'];

export default function NewTaskForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reward, setReward] = useState('');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState<Priority>('NORMAL');
  const [points, setPoints] = useState<number>(10);
  const [contribution, setContribution] = useState<Contribution | ''>('');
  const [allowMultiClaim, setAllowMultiClaim] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function selectPriority(p: Priority) {
    setPriority(p);
    setPoints(Number(PRIORITY_META[p].pointsHint));
  }

  // Heuristic "looks like core duty" warning — checks title + description against keywords.
  const coreDutyWarning = useMemo(() => {
    const blob = `${title} ${description}`.toLowerCase();
    const hit = CORE_DUTY_WARNING_KEYWORDS.find((k) => blob.includes(k.toLowerCase()));
    return hit;
  }, [title, description]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!contribution) { setErr('请选择贡献类型，这道题没有"本职"选项——如果选不出，说明它不该进任务池。'); return; }
    setBusy(true); setErr(null);
    try {
      const body: any = {
        title, description, priority, points, contribution,
        allowMultiClaim,
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
            placeholder="例如：整理 Q2 客户反馈 & 分类归档"
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
            rows={7}
            placeholder="清晰描述：做什么、验收标准、参考资料、为什么这不在任何一个岗位的日常职责内。"
            className="textarea"
          />
          {coreDutyWarning && (
            <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              ⚠️ 检测到关键词「{coreDutyWarning}」——这类内容通常属于本职工作/日常汇报，原则上<strong>不进入任务池</strong>。
              如果确实是额外的项目（比如"帮别的部门整理月报模板"），请在说明里写清区别。
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-800">
              贡献类型 <span className="text-rose-500">*</span>
            </span>
            <span className="text-xs text-slate-500">本职工作不在此列</span>
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {CONTRIBUTIONS.map((c) => {
              const m = CONTRIBUTION_META[c];
              const active = contribution === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setContribution(c)}
                  title={m.desc}
                  className={`flex items-start gap-1.5 rounded-xl px-2.5 py-2 text-left text-xs transition ${
                    active ? `${m.bg} ring-2 ${m.ring} ${m.text}` : 'bg-white ring-1 ring-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <span>{m.icon}</span>
                  <span className={active ? 'font-medium' : ''}>{m.label}</span>
                </button>
              );
            })}
          </div>
          {contribution && (
            <p className="mt-1.5 text-xs text-slate-500">{CONTRIBUTION_META[contribution as Contribution].desc}</p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-800">领取方式</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAllowMultiClaim(false)}
              className={`rounded-xl px-3 py-2.5 text-left text-xs transition ${
                !allowMultiClaim
                  ? 'bg-slate-900 text-white ring-2 ring-slate-900'
                  : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-1.5 text-sm font-medium">🔒 独占</div>
              <div className={`mt-0.5 text-[11px] ${!allowMultiClaim ? 'text-slate-300' : 'text-slate-500'}`}>
                先到先得 · 一人负责 · 别人不能再领
              </div>
            </button>
            <button
              type="button"
              onClick={() => setAllowMultiClaim(true)}
              className={`rounded-xl px-3 py-2.5 text-left text-xs transition ${
                allowMultiClaim
                  ? 'bg-indigo-600 text-white ring-2 ring-indigo-600'
                  : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-1.5 text-sm font-medium">👥 多人共享</div>
              <div className={`mt-0.5 text-[11px] ${allowMultiClaim ? 'text-indigo-100' : 'text-slate-500'}`}>
                多人可同时领取 · 按提交方案择优给分
              </div>
            </button>
          </div>
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
                    active ? `${m.bg} ring-2 ${m.ring} ${m.text}` : 'bg-white ring-1 ring-slate-200 text-slate-500 hover:bg-slate-50'
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
            <button type="submit" disabled={busy || !title || !description || !contribution} className="btn btn-primary disabled:opacity-50">
              {busy ? '发布中…' : '发布任务'}
            </button>
          </div>
        </div>
      </form>

      <aside className="rise rise-delay-1 lg:sticky lg:top-20 lg:self-start">
        <div className="mb-2 px-1 text-xs uppercase tracking-wider text-slate-400">看板预览</div>
        <div className="card relative overflow-hidden p-5">
          <div className="accent-bar absolute inset-x-0 top-0 h-0.5 opacity-70" />
          <div className="mb-3 flex flex-wrap items-start gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs text-sky-700 ring-1 ring-sky-200">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />待领取
            </span>
            {priority !== 'NORMAL' && (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs ring-1 ${PRIORITY_META[priority].bg} ${PRIORITY_META[priority].text} ${PRIORITY_META[priority].ring}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_META[priority].dot} ${priority === 'URGENT' ? 'urgent-pulse' : ''}`} />
                {PRIORITY_META[priority].label}
              </span>
            )}
            {contribution && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ${CONTRIBUTION_META[contribution as Contribution].bg} ${CONTRIBUTION_META[contribution as Contribution].text} ${CONTRIBUTION_META[contribution as Contribution].ring}`}>
                {CONTRIBUTION_META[contribution as Contribution].icon} {CONTRIBUTION_META[contribution as Contribution].label}
              </span>
            )}
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ${allowMultiClaim ? 'bg-indigo-50 text-indigo-700 ring-indigo-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
              {allowMultiClaim ? '👥 多人共享' : '🔒 独占'}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <span className="inline-flex items-baseline gap-0.5 rounded-md bg-slate-900/5 px-1.5 py-0.5 text-xs font-semibold text-slate-700">
                {points}<span className="text-[10px] font-normal opacity-60">分</span>
              </span>
              {reward && <div className="reward-chip rounded-lg px-2.5 py-1 text-xs">{reward}</div>}
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
            <span><strong>贡献类型必选</strong>。如果选不出来，说明这不是任务池该做的事（可能是本职或日常汇报）。</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 text-slate-400">②</span>
            <span>手册 § 2.5 已写明：任务池面向全员，但需本职达标 + 绩效优秀才可申请参与。</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 text-slate-400">③</span>
            <span>每人同时最多 3 条进行中 · 驳回不计分 · 积分计入战功榜和年度考核档案。</span>
          </li>
        </ul>
      </aside>
    </div>
  );
}
