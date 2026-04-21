'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type UserOpt = { id: string; name: string | null; email: string; image: string | null };
type Membership = { id: string; userId: string; role: string; user: UserOpt };
type Dept = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  leadUserId: string | null;
  parentId: string | null;
  order: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lead: { id: string; name: string | null; email: string } | null;
  memberships: Membership[];
};

function initialOf(s: string | null | undefined) {
  return (s || '?').slice(0, 1).toUpperCase();
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}

export default function DepartmentsClient({
  initial,
  users,
}: {
  initial: Dept[];
  users: UserOpt[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<Dept[]>(initial);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [leadUserId, setLeadUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim() || slugify(name),
          leadUserId: leadUserId || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '创建失败');
      const d = await res.json();
      setItems((prev) => [...prev, { ...d, memberships: [], lead: users.find((u) => u.id === d.leadUserId) ? { id: d.leadUserId, name: users.find((u) => u.id === d.leadUserId)!.name, email: users.find((u) => u.id === d.leadUserId)!.email } : null }]);
      setName(''); setSlug(''); setLeadUserId('');
      router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function patch(id: string, data: any) {
    const res = await fetch(`/api/departments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) { alert((await res.json()).error ?? '更新失败'); return null; }
    const d = await res.json();
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...d } : p)));
    router.refresh();
    return d;
  }

  async function remove(id: string) {
    if (!confirm('确认删除该部门？部门成员关系会一同移除。')) return;
    const res = await fetch(`/api/departments/${id}`, { method: 'DELETE' });
    if (!res.ok) { alert((await res.json()).error ?? '删除失败'); return; }
    setItems((prev) => prev.filter((p) => p.id !== id));
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <form onSubmit={create} className="card rise space-y-3 p-4 sm:p-5">
        <div className="text-sm font-semibold">新建部门</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">名称 *</label>
            <input value={name} onChange={(e) => { setName(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }} required placeholder="产品部" className="input" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">标识</label>
            <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="product" className="input font-mono text-xs" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">部门负责人</label>
            <select value={leadUserId} onChange={(e) => setLeadUserId(e.target.value)} className="select">
              <option value="">—— 暂不指定 ——</option>
              {users.map((u) => (<option key={u.id} value={u.id}>{u.name ?? u.email}</option>))}
            </select>
          </div>
        </div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={busy} className="btn btn-primary">{busy ? '创建中…' : '创建部门'}</button>
        </div>
      </form>

      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((d) => (
          <DeptCard key={d.id} dept={d} users={users} onPatch={patch} onRemove={remove} />
        ))}
        {items.length === 0 && (
          <li className="card col-span-full py-14 text-center text-sm text-slate-500">
            还没有部门。新建一个开始吧。
          </li>
        )}
      </ul>
    </div>
  );
}

function DeptCard({
  dept,
  users,
  onPatch,
  onRemove,
}: {
  dept: Dept;
  users: UserOpt[];
  onPatch: (id: string, data: any) => Promise<any>;
  onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(dept.name);
  const [description, setDescription] = useState(dept.description ?? '');
  const [leadUserId, setLeadUserId] = useState(dept.leadUserId ?? '');
  const [memberIds, setMemberIds] = useState<string[]>(dept.memberships.map((m) => m.userId));
  const [adminIds, setAdminIds] = useState<string[]>(
    dept.memberships.filter((m) => m.role === 'ADMIN').map((m) => m.userId)
  );

  function toggleMember(id: string) {
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    // If a user is removed from the dept, they also lose the admin flag.
    if (memberIds.includes(id)) setAdminIds((prev) => prev.filter((x) => x !== id));
  }

  function toggleAdmin(id: string) {
    if (!memberIds.includes(id)) return;
    setAdminIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    await onPatch(dept.id, {
      name,
      description: description || null,
      leadUserId: leadUserId || null,
      memberIds,
      memberAdminIds: adminIds.filter((id) => memberIds.includes(id)),
    });
    setEditing(false);
  }

  return (
    <li className="card p-4 sm:p-5">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{dept.name}</h3>
          <div className="text-xs text-slate-500 font-mono">{dept.slug}</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing((v) => !v)} className="btn btn-ghost text-xs">
            {editing ? '取消' : '编辑'}
          </button>
          <button onClick={() => onRemove(dept.id)} className="text-xs text-rose-600">删除</button>
        </div>
      </div>

      {dept.description && !editing && (
        <p className="mb-2 text-sm text-slate-600">{dept.description}</p>
      )}
      {dept.lead && !editing && (
        <div className="mb-3 text-xs text-slate-500">
          负责人：<span className="text-slate-800">{dept.lead.name ?? dept.lead.email}</span>
        </div>
      )}

      {!editing ? (
        <>
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
            成员（{dept.memberships.length}）
          </div>
          {dept.memberships.length === 0 ? (
            <div className="text-xs text-slate-400">还没有添加成员</div>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {dept.memberships.map((m) => {
                const isAdmin = m.role === 'ADMIN';
                return (
                  <li key={m.id} className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${isAdmin ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300' : 'bg-slate-100'}`}>
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-rose-300 to-red-400 text-[9px] font-semibold text-white">
                      {initialOf(m.user.name ?? m.user.email)}
                    </span>
                    {m.user.name ?? m.user.email}
                    {isAdmin && <span className="text-[10px] font-semibold">· {dept.name}管理员</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">名称</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">简介</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="textarea" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">负责人</label>
            <select value={leadUserId} onChange={(e) => setLeadUserId(e.target.value)} className="select">
              <option value="">—— 无 ——</option>
              {users.map((u) => (<option key={u.id} value={u.id}>{u.name ?? u.email}</option>))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">
              成员 · 勾选"管" = 部门管理员（可审批本部门报销等，但无法审批自己的单，且本人发起的审批会自动升级到总管理者）
            </label>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
              <ul className="space-y-0.5">
                {users.map((u) => {
                  const isMember = memberIds.includes(u.id);
                  const isAdmin = adminIds.includes(u.id);
                  return (
                    <li key={u.id}>
                      <div className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={isMember}
                          onChange={() => toggleMember(u.id)}
                          aria-label="部门成员"
                        />
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-rose-300 to-red-400 text-[10px] font-semibold text-white">
                          {initialOf(u.name ?? u.email)}
                        </span>
                        <span className="flex-1">{u.name ?? u.email}</span>
                        <label className={`inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-[11px] ring-1 transition ${
                          isAdmin && isMember
                            ? 'bg-amber-500 text-white ring-amber-500'
                            : isMember
                              ? 'bg-white text-slate-500 ring-slate-200 hover:bg-amber-50'
                              : 'cursor-not-allowed bg-slate-50 text-slate-300 ring-slate-100'
                        }`}>
                          <input
                            type="checkbox"
                            className="hidden"
                            disabled={!isMember}
                            checked={isAdmin}
                            onChange={() => toggleAdmin(u.id)}
                          />
                          管
                        </label>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="btn btn-ghost">取消</button>
            <button onClick={save} className="btn btn-primary">保存</button>
          </div>
        </div>
      )}
    </li>
  );
}
