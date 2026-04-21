'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Ann = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  publishedAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string | null; email: string };
  readingsCount: number;
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AnnouncementsAdminClient({ initial, totalActive }: { initial: Ann[]; totalActive: number }) {
  const router = useRouter();
  const [items, setItems] = useState<Ann[]>(initial);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [ok, setOk] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) { setErr('标题和正文必填'); return; }
    setBusy(true); setErr(null); setOk(null);
    try {
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          pinned,
          expiresAt: expires ? new Date(expires).toISOString() : null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error ?? payload.message ?? `发布失败 (HTTP ${res.status})`);
      }
      const a = payload;
      if (!a || !a.id) {
        throw new Error('服务器未返回公告 ID，可能未成功写入，请刷新页面确认');
      }
      setItems((prev) => [{ ...a, createdBy: { id: '', name: '你', email: '' }, readingsCount: 0, publishedAt: a.publishedAt, expiresAt: a.expiresAt, createdAt: a.createdAt, updatedAt: a.updatedAt }, ...prev]);
      setTitle(''); setBody(''); setPinned(false); setExpires('');
      setOk(`发布成功，公告已上墙。成员会收到邮件通知。`);
      router.refresh();
    } catch (e: any) { setErr(e.message || '发布失败（未知错误）'); } finally { setBusy(false); }
  }

  async function togglePin(a: Ann) {
    const res = await fetch(`/api/announcements/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !a.pinned }),
    });
    if (!res.ok) { alert('操作失败'); return; }
    const u = await res.json();
    setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, pinned: u.pinned } : x)));
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm('确认删除？已读记录也会一起删除。')) return;
    const res = await fetch(`/api/announcements/${id}`, { method: 'DELETE' });
    if (!res.ok) { alert('删除失败'); return; }
    setItems((prev) => prev.filter((x) => x.id !== id));
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="card rise space-y-3 p-4 sm:p-5">
        <div className="text-sm font-semibold">发布新公告</div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">标题 *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} className="input" placeholder="例：5 月假期安排" />
        </div>
        <div>
          <label className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">正文 *</span>
            <span className="text-xs text-slate-400">{body.length}/20000</span>
          </label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} required maxLength={20000} rows={6} className="textarea" placeholder="支持换行。重要内容清晰、分点。" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            <span>📌 置顶公告</span>
          </label>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">有效期（可选）</label>
            <input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} className="input" />
          </div>
        </div>
        {err && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            ⚠️ {err}
          </div>
        )}
        {ok && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <span>✓ {ok}</span>
            <a href="/announcements" className="rounded-md bg-emerald-700 px-2.5 py-1 text-xs text-white hover:bg-emerald-800">
              前往公告页确认 →
            </a>
          </div>
        )}
        <div className="flex justify-end">
          <button type="submit" disabled={busy} className="btn btn-primary">{busy ? '发布中…' : '发布'}</button>
        </div>
      </form>

      <ul className="space-y-3">
        {items.map((a) => (
          <li key={a.id} className={`card p-4 sm:p-5 ${a.pinned ? 'ring-2 ring-amber-300' : ''}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  {a.pinned && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 ring-1 ring-amber-300">📌 置顶</span>}
                  <span className="text-xs text-slate-500">{a.createdBy.name ?? a.createdBy.email} · {fmt(a.publishedAt)}</span>
                  {a.expiresAt && <span className="text-xs text-slate-400">至 {fmt(a.expiresAt)}</span>}
                </div>
                <h3 className="text-base font-semibold">{a.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{a.body}</p>
                <div className="mt-2 text-xs text-slate-500">
                  已读 {a.readingsCount} / {totalActive}
                  {totalActive > 0 && ` · ${Math.round((a.readingsCount / totalActive) * 100)}%`}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1 text-xs">
                <button onClick={() => togglePin(a)} className="text-slate-600 hover:text-amber-700">
                  {a.pinned ? '取消置顶' : '置顶'}
                </button>
                <button onClick={() => remove(a.id)} className="text-rose-600">删除</button>
              </div>
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <li className="card py-14 text-center text-sm text-slate-500">还没有公告</li>
        )}
      </ul>
    </div>
  );
}
