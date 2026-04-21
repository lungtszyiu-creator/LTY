'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Board = {
  id: string;
  name: string;
  iframeUrl: string;
  description: string | null;
  icon: string | null;
  order: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export default function ProjectsAdminClient({ initial }: { initial: Board[] }) {
  const router = useRouter();
  const [boards, setBoards] = useState<Board[]>(initial);
  const [name, setName] = useState('');
  const [iframeUrl, setIframeUrl] = useState('');
  const [icon, setIcon] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !iframeUrl.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          iframeUrl: iframeUrl.trim(),
          icon: icon.trim() || null,
          description: description.trim() || null,
          order: boards.length,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '创建失败');
      const b = await res.json();
      setBoards((prev) => [...prev, b]);
      setName(''); setIframeUrl(''); setIcon(''); setDescription('');
      router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function patch(id: string, data: any) {
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) { alert('操作失败'); return; }
    const b = await res.json();
    setBoards((prev) => prev.map((x) => (x.id === id ? { ...x, ...b } : x)));
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm('删除该看板配置？')) return;
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    if (!res.ok) { alert('删除失败'); return; }
    setBoards((prev) => prev.filter((x) => x.id !== id));
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <form onSubmit={create} className="card rise space-y-3 p-4 sm:p-5">
        <div className="text-sm font-semibold">添加新看板</div>
        <div className="grid gap-3 sm:grid-cols-[1fr_4fr_auto]">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">图标</label>
            <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="📊" maxLength={10} className="input text-center text-lg" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">看板名称 *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} className="input" placeholder="例：产品路线图 / 市场活动 / 运维事件" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">嵌入 URL *</label>
          <input value={iframeUrl} onChange={(e) => setIframeUrl(e.target.value)} required type="url" className="input font-mono text-xs" placeholder="https://your-team.atlassian.net/jira/software/projects/XXX/boards/1" />
          <p className="mt-1 text-xs text-slate-500">
            Jira → Share → Embed code；Airtable → Share → Embed this view；Notion → Share → Publish to web → Embed；Lark 多维表 → 分享 → 嵌入代码
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">简介（可选）</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} className="input" placeholder="一句话说明这个看板是干嘛的" />
        </div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={busy} className="btn btn-primary">{busy ? '添加中…' : '添加看板'}</button>
        </div>
      </form>

      <ul className="space-y-3">
        {boards.map((b) => (
          <li key={b.id} className={`card p-4 sm:p-5 ${!b.active ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  {b.icon && <span className="text-xl">{b.icon}</span>}
                  <h3 className="text-base font-semibold">{b.name}</h3>
                  {!b.active && <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">已禁用</span>}
                </div>
                {b.description && <p className="text-sm text-slate-600">{b.description}</p>}
                <a href={b.iframeUrl} target="_blank" className="mt-1 line-clamp-1 block text-xs text-indigo-600 underline-offset-2 hover:underline">
                  {b.iframeUrl}
                </a>
              </div>
              <div className="flex shrink-0 flex-col gap-1 text-xs">
                <button onClick={() => patch(b.id, { active: !b.active })} className="text-slate-600">
                  {b.active ? '禁用' : '启用'}
                </button>
                <button onClick={() => remove(b.id)} className="text-rose-600">删除</button>
              </div>
            </div>
          </li>
        ))}
        {boards.length === 0 && (
          <li className="card py-14 text-center text-sm text-slate-500">还没有看板，上面加一个吧。</li>
        )}
      </ul>
    </div>
  );
}
