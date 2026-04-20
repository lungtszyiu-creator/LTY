'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Penalty = {
  id: string;
  userId: string;
  taskId: string | null;
  reason: string;
  points: number;
  status: string;
  revokedAt: string | null;
  revokeReason: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string | null; email: string; image: string | null };
  issuedBy: { id: string; name: string | null; email: string };
  revokedBy: { id: string; name: string | null; email: string } | null;
  task: { id: string; title: string } | null;
};

type UserOpt = { id: string; name: string | null; email: string };

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : '';
}

function letter(s: string | null | undefined) {
  return (s || '?').slice(0, 1).toUpperCase();
}

export default function PenaltiesAdminClient({
  initial,
  users,
}: {
  initial: Penalty[];
  users: UserOpt[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<Penalty[]>(initial);
  const [userId, setUserId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [reason, setReason] = useState('');
  const [points, setPoints] = useState(20);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || reason.trim().length < 5) {
      setErr('请选择成员并填写至少 5 个字符的扣罚理由');
      return;
    }
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/penalties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          taskId: taskId.trim() || null,
          reason: reason.trim(),
          points,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '登记失败');
      const p = await res.json();
      setItems((prev) => [{ ...p, user: users.find((u) => u.id === p.userId)! , issuedBy: { id: '', name: '你', email: '' }, revokedBy: null, task: null, createdAt: p.createdAt, updatedAt: p.updatedAt, revokedAt: null }, ...prev]);
      setUserId(''); setTaskId(''); setReason(''); setPoints(20);
      router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function revoke(id: string) {
    const reason = prompt('撤销理由（必填）：');
    if (!reason || !reason.trim()) return;
    const res = await fetch(`/api/penalties/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'REVOKED', revokeReason: reason.trim() }),
    });
    if (!res.ok) { alert((await res.json()).error ?? '撤销失败'); return; }
    const p = await res.json();
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...p, revokedAt: p.revokedAt } : x)));
    router.refresh();
  }

  const active = items.filter((p) => p.status === 'ACTIVE');
  const totalDeduction = active.reduce((a, c) => a + c.points, 0);

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 rise rise-delay-1">
        <Stat label="生效中" value={active.length} tone="rose" />
        <Stat label="累计扣罚" value={totalDeduction} tone="rose" suffix=" 分" />
        <Stat label="历史总数" value={items.length} tone="slate" />
        <Stat label="已撤销" value={items.length - active.length} tone="slate" />
      </section>

      <form onSubmit={submit} className="card rise rise-delay-1 space-y-3 p-4 sm:p-5">
        <div className="text-sm font-semibold">登记扣罚</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">被扣罚成员 *</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="select">
              <option value="">—— 选择成员 ——</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">扣除积分 *</label>
            <input
              type="number" min={1} max={9999}
              value={points}
              onChange={(e) => setPoints(Math.max(1, Math.min(9999, Number(e.target.value))))}
              className="input"
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">关联任务 ID（可选）</label>
          <input
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            placeholder="粘贴任务 ID 可关联查看"
            className="input font-mono text-xs"
          />
        </div>
        <div>
          <label className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">扣罚理由 *</span>
            <span className="text-xs text-slate-400">{reason.length}/2000</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="例：领取任务《XXX》后 7 天内无进展，联系无响应；浪费他人协作时间。建议扣双倍积分。"
            className="textarea"
          />
        </div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={busy} className="btn btn-primary">
            {busy ? '登记中…' : '登记并邮件通知'}
          </button>
        </div>
      </form>

      <ul className="space-y-3">
        {items.map((p) => (
          <li key={p.id} className={`card p-4 sm:p-5 ${p.status === 'REVOKED' ? 'opacity-70' : ''}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-red-600 text-sm font-semibold text-white">
                  {letter(p.user.name ?? p.user.email)}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.user.name ?? p.user.email}</span>
                    {p.status === 'ACTIVE' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700 ring-1 ring-rose-200">
                        生效 · 扣 {p.points} 分
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">
                        已撤销
                      </span>
                    )}
                  </div>
                  {p.task && (
                    <Link href={`/tasks/${p.task.id}`} className="line-clamp-1 mt-0.5 block text-sm text-slate-700 underline-offset-2 hover:underline">
                      任务：{p.task.title}
                    </Link>
                  )}
                  <div className="mt-1.5 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-100">
                    {p.reason}
                  </div>
                  <div className="mt-1.5 text-xs text-slate-500">
                    {p.issuedBy?.name ?? p.issuedBy?.email ?? '—'} 于 {fmt(p.createdAt)} 登记
                  </div>
                  {p.status === 'REVOKED' && p.revokedAt && (
                    <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 ring-1 ring-emerald-100">
                      {p.revokedBy?.name ?? p.revokedBy?.email ?? '管理员'} 于 {fmt(p.revokedAt)} 撤销
                      {p.revokeReason && <span className="ml-1">· {p.revokeReason}</span>}
                    </div>
                  )}
                </div>
              </div>
              {p.status === 'ACTIVE' && (
                <button onClick={() => revoke(p.id)} className="btn btn-ghost text-xs text-amber-700">
                  撤销
                </button>
              )}
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <li className="card py-14 text-center text-sm text-slate-500">暂无扣罚记录</li>
        )}
      </ul>
    </div>
  );
}

function Stat({ label, value, tone, suffix }: { label: string; value: number; tone: 'rose' | 'slate'; suffix?: string }) {
  const cls = tone === 'rose' ? 'text-rose-700' : 'text-slate-700';
  return (
    <div className="card flex items-center justify-between px-4 py-3">
      <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`text-2xl font-semibold tabular-nums ${cls}`}>
        {value}{suffix ? <span className="text-xs font-normal opacity-60">{suffix}</span> : ''}
      </span>
    </div>
  );
}
