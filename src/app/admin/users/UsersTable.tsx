'use client';

import { useState } from 'react';

type U = {
  id: string; name: string | null; email: string; image: string | null;
  role: string; active: boolean; createdAt: string;
};

export default function UsersTable({ initial, meId }: { initial: U[]; meId: string }) {
  const [users, setUsers] = useState<U[]>(initial);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <form onSubmit={addUser} className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-4">
        <label className="flex-1">
          <span className="mb-1 block text-xs font-medium text-slate-700">邮箱</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
            placeholder="name@company.com"
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-slate-400 focus:outline-none" />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-slate-700">角色</span>
          <select value={role} onChange={(e) => setRole(e.target.value as any)}
            className="rounded-lg border px-3 py-2 text-sm focus:border-slate-400 focus:outline-none">
            <option value="MEMBER">成员</option>
            <option value="ADMIN">管理员</option>
          </select>
        </label>
        <button type="submit" disabled={busy}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          添加
        </button>
        {err && <p className="w-full text-sm text-rose-600">{err}</p>}
      </form>

      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">用户</th>
              <th className="px-4 py-3 text-left">邮箱</th>
              <th className="px-4 py-3 text-left">角色</th>
              <th className="px-4 py-3 text-left">状态</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3">{u.name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                <td className="px-4 py-3">
                  <select value={u.role} onChange={(e) => patch(u.id, { role: e.target.value as any })}
                    className="rounded border px-2 py-1 text-xs">
                    <option value="MEMBER">成员</option>
                    <option value="ADMIN">管理员</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={u.active}
                      onChange={(e) => patch(u.id, { active: e.target.checked })} />
                    <span className="text-xs text-slate-600">{u.active ? '已激活' : '已禁用'}</span>
                  </label>
                </td>
                <td className="px-4 py-3 text-right">
                  {u.id !== meId && (
                    <button onClick={() => remove(u.id)} className="text-xs text-rose-600 hover:underline">
                      删除
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
