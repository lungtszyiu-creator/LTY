'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { APPROVAL_CATEGORY_META } from '@/lib/approvalFlow';

type Tpl = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  category: string;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string | null; email: string };
  categoryMeta: { label: string; icon: string };
  instanceCount: number;
};

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}

export default function TemplateListClient({ initial }: { initial: Tpl[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Tpl[]>(initial);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [category, setCategory] = useState('OTHER');
  const [icon, setIcon] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/approvals/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: (slug.trim() || slugify(name)),
          category,
          icon: icon.trim() || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '创建失败');
      const t = await res.json();
      router.push(`/admin/approvals/templates/${t.id}`);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function toggleActive(t: Tpl) {
    const res = await fetch(`/api/approvals/templates/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !t.active }),
    });
    if (!res.ok) { alert('操作失败'); return; }
    const u = await res.json();
    setItems((prev) => prev.map((x) => (x.id === t.id ? { ...x, active: u.active } : x)));
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <form onSubmit={create} className="card rise space-y-3 p-4 sm:p-5">
        <div className="text-sm font-semibold">新建审批模板</div>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr_1fr]">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">图标</label>
            <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🌴" maxLength={10} className="input text-center text-lg" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">名称 *</label>
            <input value={name} onChange={(e) => { setName(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }} required maxLength={100} className="input" placeholder="例：年假申请" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">标识</label>
            <input value={slug} onChange={(e) => setSlug(e.target.value)} className="input font-mono text-xs" placeholder="annual-leave" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">分类</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="select">
              {Object.entries(APPROVAL_CATEGORY_META).map(([k, v]) => (
                <option key={k} value={k}>{v.icon} {v.label}</option>
              ))}
            </select>
          </div>
        </div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={busy} className="btn btn-primary">{busy ? '创建中…' : '创建并进入编辑'}</button>
        </div>
      </form>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((t) => (
          <li key={t.id} className={`card p-4 ${!t.active ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <span className="text-2xl">{t.icon || t.categoryMeta.icon}</span>
                <div>
                  <div className="font-semibold">{t.name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{t.categoryMeta.label} · 已用 {t.instanceCount} 次</div>
                </div>
              </div>
              {!t.active && <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">已禁用</span>}
            </div>
            {t.description && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{t.description}</p>}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-500">{t.createdBy.name ?? t.createdBy.email}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleActive(t)} className="text-slate-600 hover:text-slate-900">
                  {t.active ? '禁用' : '启用'}
                </button>
                <Link href={`/admin/approvals/templates/${t.id}`} className="text-indigo-600 hover:underline">
                  编辑 →
                </Link>
              </div>
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <li className="card col-span-full py-14 text-center text-sm text-slate-500">
            还没有模板。上面新建一个开始。
          </li>
        )}
      </ul>
    </div>
  );
}
