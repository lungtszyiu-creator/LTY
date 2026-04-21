'use client';

import { useEffect, useState } from 'react';

type Role = 'SUPER_ADMIN' | 'ADMIN' | 'MEMBER';

type U = {
  id: string; name: string | null; email: string; image: string | null;
  role: string; active: boolean; createdAt: string;
  annualLeaveBalance: number; compLeaveBalance: number;
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
  canEditBalance,
}: {
  initial: U[];
  meId: string;
  meRole: Role;
  canEditBalance: boolean;
}) {
  const [users, setUsers] = useState<U[]>(initial);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('MEMBER');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const iAmSuper = meRole === 'SUPER_ADMIN';
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

  function canEdit(u: U): boolean {
    if (iAmSuper) return true;
    return u.role === 'MEMBER';
  }

  return (
    <div className="space-y-5">
      {!canEditBalance && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          🔒 员工假期余额（年假 / 调休）只有 <strong>总管理者</strong> 和 <strong>人事部负责人</strong> 可以修改。你当前为只读查看。
        </div>
      )}

      {/* Add-user form — mobile first: inputs stack, desktop: inline row */}
      <form onSubmit={addUser} className="card rise space-y-3 p-4 sm:flex sm:flex-wrap sm:items-end sm:gap-3 sm:space-y-0 sm:p-5">
        <div className="min-w-0 sm:flex-1">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">邮箱</label>
          <input
            value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
            placeholder="name@company.com"
            className="input"
          />
        </div>
        <div className="sm:w-auto">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">角色</label>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="select">
            {assignableRoles.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={busy} className="btn btn-primary w-full justify-center sm:w-auto">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
          {busy ? '添加中…' : '添加成员'}
        </button>
        {!iAmSuper && (
          <p className="w-full text-xs text-slate-500">只有总管理员可以添加 / 升级管理员。</p>
        )}
        {err && <p className="w-full text-sm text-rose-600">{err}</p>}
      </form>

      {/* Desktop table (hidden below sm) */}
      <div className="card rise rise-delay-1 hidden overflow-hidden sm:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3 text-left font-medium">用户</th>
              <th className="px-5 py-3 text-left font-medium">邮箱</th>
              <th className="px-5 py-3 text-left font-medium">角色</th>
              <th className="px-5 py-3 text-left font-medium">假期余额（天）</th>
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
                    <BalanceInputs
                      annual={u.annualLeaveBalance}
                      comp={u.compLeaveBalance}
                      editable={editable && canEditBalance}
                      onSave={(patchData) => patch(u.id, patchData as any)}
                    />
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
                <td colSpan={6} className="py-10 text-center text-sm text-slate-500">还没有用户</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card list (hidden at sm+) */}
      <ul className="space-y-3 sm:hidden">
        {users.map((u) => {
          const editable = canEdit(u);
          const roleKey = (u.role as Role) ?? 'MEMBER';
          return (
            <li key={u.id} className="card rise rise-delay-1 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-300 to-fuchsia-300 text-sm font-semibold text-white">
                  {(u.name ?? u.email).slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{u.name ?? '未命名'}</span>
                    {u.id === meId && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">你</span>}
                  </div>
                  <div className="truncate text-xs text-slate-500">{u.email}</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">角色</div>
                  {editable ? (
                    <select
                      value={u.role}
                      onChange={(e) => patch(u.id, { role: e.target.value as any })}
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
                    >
                      {assignableRoles.map((r) => (
                        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                      ))}
                      {!assignableRoles.includes(roleKey) && (
                        <option value={roleKey}>{ROLE_LABEL[roleKey]}</option>
                      )}
                    </select>
                  ) : (
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ring-1 ${ROLE_CHIP[roleKey]}`}>
                      {ROLE_LABEL[roleKey]}
                    </span>
                  )}
                </div>
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">状态</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => editable && patch(u.id, { active: !u.active })}
                      disabled={!editable}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition disabled:opacity-50 ${u.active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                      aria-pressed={u.active}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${u.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                    <span className="text-xs text-slate-500">{u.active ? '已激活' : '已禁用'}</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 border-t border-slate-100 pt-3">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">假期余额（天）</div>
                <BalanceInputs
                  annual={u.annualLeaveBalance}
                  comp={u.compLeaveBalance}
                  editable={editable}
                  onSave={(patchData) => patch(u.id, patchData as any)}
                />
              </div>

              {u.id !== meId && editable && (
                <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
                  <button onClick={() => remove(u.id)} className="text-xs text-rose-600">
                    删除成员
                  </button>
                </div>
              )}
            </li>
          );
        })}
        {users.length === 0 && (
          <li className="card py-10 text-center text-sm text-slate-500">还没有用户</li>
        )}
      </ul>
    </div>
  );
}

function BalanceInputs({
  annual, comp, editable, onSave,
}: {
  annual: number; comp: number; editable: boolean;
  onSave: (patch: { annualLeaveBalance?: number; compLeaveBalance?: number }) => void;
}) {
  const [a, setA] = useState(String(annual ?? 0));
  const [c, setC] = useState(String(comp ?? 0));
  const aDirty = Number(a) !== Number(annual);
  const cDirty = Number(c) !== Number(comp);

  // Keep local inputs in sync when the server pushes a new number back via
  // parent state (e.g. after a save elsewhere) — but only when the user
  // isn't mid-type, to avoid clobbering what they're typing.
  useEffect(() => {
    if (!aDirty) setA(String(annual));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annual]);
  useEffect(() => {
    if (!cDirty) setC(String(comp));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp]);

  function commit() {
    const patch: any = {};
    if (aDirty) patch.annualLeaveBalance = Number(a);
    if (cDirty) patch.compLeaveBalance = Number(c);
    if (Object.keys(patch).length > 0) onSave(patch);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <label className="inline-flex items-center gap-1">
        <span className="text-slate-500">年假</span>
        <input
          type="number" step="0.5" disabled={!editable}
          value={a}
          onChange={(e) => setA(e.target.value)}
          onBlur={commit}
          className="w-16 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-right text-xs font-semibold tabular-nums disabled:bg-slate-50 disabled:text-slate-400"
        />
      </label>
      <label className="inline-flex items-center gap-1">
        <span className="text-slate-500">调休</span>
        <input
          type="number" step="0.5" disabled={!editable}
          value={c}
          onChange={(e) => setC(e.target.value)}
          onBlur={commit}
          className="w-16 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-right text-xs font-semibold tabular-nums disabled:bg-slate-50 disabled:text-slate-400"
        />
      </label>
      {(aDirty || cDirty) && editable && (
        <button type="button" onClick={commit} className="rounded bg-indigo-600 px-2 py-0.5 text-[10px] text-white hover:bg-indigo-700">保存</button>
      )}
    </div>
  );
}
