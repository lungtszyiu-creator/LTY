'use client';

import { useState } from 'react';

type Role = 'SUPER_ADMIN' | 'ADMIN' | 'MEMBER';

type U = {
  id: string; name: string | null; email: string; image: string | null;
  role: string; active: boolean; createdAt: string;
};

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: '总管理员',
  ADMIN: '管理员',
  MEMBER: '成员',
};

const ROLE_CHIP: Record<Role, string> = {
  SUPER_ADMIN: 'bg-amber-100 text-amber-900 ring-amber-300',
  ADMIN: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  MEMBER: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export default function UsersTable({
  initial,
  meId,
  meRole,
}: {
  initial: U[];
  meId: string;
  meRole: Role;
}) {
  const [users, setUsers] = useState<U[]>(initial);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('MEMBER');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const iAmSuper = meRole === 'SUPER_ADMIN';
  // Which role options this admin can assign when creating a user.
  const assignableRoles: Role[] = iAmSuper ? ['MEMBER', 'ADMIN', 'SUPER_ADMIN'] : ['MEMBER'];

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '添加失败');
      const u = await res.json();
      setUsers((prev) => {
        const idx = prev.findIndex((p) => p.id === u.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = { ...u, createdAt: u.createdAt }; return next; }
        return [{ ...u, createdAt: u.createdAt }, ...prev];
      });
      setEmail('');
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function patch(id: string, data: Partial<U>) {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) { alert((await res.json()).error || '操作失败'); return; }
    const u = await res.json();
    setUsers((prev) => prev.map((p) => (p.id === id ? { ...p, ...u } : p)));
  }

  async function remove(id: string) {
    if (!confirm('确认删除该用户？其创建的任务仍会保留。')) return;
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    if (!res.ok) { alert((await res.json()).error || '操作失败'); return; }
    setUsers((prev) => prev.filter((p) => p.id !== id));
  }

  // A regular admin cannot touch another admin / super-admin at all.
  function canEdit(u: U): boolean {
    if (iAmSuper) return true;
    return u.role === 'MEMBER';
  }

  return (
    <div className="space-y-6">
      <form onSubmit={addUser} className="card rise flex flex-wrap items-end gap-3 p-5">
        <div className="flex-1 min-w-[240px]">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">邮箱</label>
          <input
            value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
            placeholder="name@company.com"
            className="input"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">角色</label>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="select">
            {assignableRoles.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={busy} className="btn btn-primary">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
          {busy ? '添加中…' : '添加成员'}
        </button>
        {!iAmSuper && (
          <p className="w-full text-xs text-slate-500">只有总管理员可以添加 / 升级管理员。</p>
        )}
        {err && <p className="w-full text-sm text-rose-600">{err}</p>}
      </form>

      <div className="card rise rise-delay-1 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3 text-left font-medium">用户</th>
              <th className="px-5 py-3 text-left font-medium">邮箱</th>
              <th className="px-5 py-3 text-left font-medium">角色</th>
              <th className="px-5 py-3 text-left font-medium">状态</th>
              <th className="px-5 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => {
              const editable = canEdit(u);
              const roleKey = (u.role as Role) ?? 'MEMBER';
              return (
                <tr key={u.id} className="transition hover:bg-slate-50/60">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-300 to-fuchsia-300 text-xs font-semibold text-white">
                        {(u.name ?? u.email).slice(0, 1).toUpperCase()}
                      </div>
                      <span className="font-medium">{u.name ?? '—'}</span>
                      {u.id === meId && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">你</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{u.email}</td>
                  <td className="px-5 py-3">
                    {editable ? (
                      <select
                        value={u.role}
                        onChange={(e) => patch(u.id, { role: e.target.value as any })}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                      >
                        {assignableRoles.map((r) => (
                          <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                        ))}
                        {/* Keep current role as an option even if not otherwise assignable (e.g. admin viewing self) */}
                        {!assignableRoles.includes(roleKey) && (
                          <option value={roleKey}>{ROLE_LABEL[roleKey]}</option>
                        )}
                      </select>
                    ) : (
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ring-1 ${ROLE_CHIP[roleKey]}`}>
                        {ROLE_LABEL[roleKey]}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      type="button"
                      onClick={() => editable && patch(u.id, { active: !u.active })}
                      disabled={!editable}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition disabled:opacity-50 ${u.active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                      aria-pressed={u.active}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${u.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                    <span className="ml-2 text-xs text-slate-500">{u.active ? '已激活' : '已禁用'}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {u.id !== meId && editable && (
                      <button onClick={() => remove(u.id)} className="text-xs text-slate-400 hover:text-rose-600">
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-sm text-slate-500">还没有用户</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
