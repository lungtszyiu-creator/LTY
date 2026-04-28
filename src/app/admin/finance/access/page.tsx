'use client';

/**
 * 财务访问授权管理页（仅老板/SUPER_ADMIN 可见）
 *
 * 功能：
 * - 列出所有当前有财务权限的人
 * - 通过 email 搜索增加新成员（VIEWER 或 EDITOR）
 * - 移除某人的财务权限
 *
 * 设计哲学：
 * - 默认全员**没有**财务权限（financeRole = null）
 * - 老板（SUPER_ADMIN）自动有权，无需设值
 * - 出纳：VIEWER（只读）
 * - 其他需要写权限的人：EDITOR（罕见）
 */
import { useEffect, useState } from 'react';

type AccessUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  financeRole: 'VIEWER' | 'EDITOR' | null;
};

type AllUser = {
  id: string;
  name: string | null;
  email: string;
};

export default function FinanceAccessAdminPage() {
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [allUsers, setAllUsers] = useState<AllUser[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const [r1, r2] = await Promise.all([
      fetch('/api/finance/access', { cache: 'no-store' }),
      fetch('/api/users', { cache: 'no-store' }),
    ]);
    if (r1.ok) setUsers((await r1.json()).users);
    if (r2.ok) {
      const data = await r2.json();
      setAllUsers(Array.isArray(data) ? data : data.users ?? []);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function setRole(userId: string, financeRole: 'VIEWER' | 'EDITOR' | null) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/finance/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, financeRole }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message ?? data.error ?? 'failed');
      setMsg(`✅ ${data.name ?? data.email} 现在是${
        financeRole === 'EDITOR' ? '财务管理员（可读写）' :
        financeRole === 'VIEWER' ? '只读账号' :
        '已收回权限'
      }`);
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  const grantedIds = new Set(users.map((u) => u.id));
  const candidates = allUsers
    .filter((u) => !grantedIds.has(u.id))
    .filter((u) => {
      const q = search.toLowerCase().trim();
      if (!q) return false; // 不输入不显示候选（避免一打开就列全员）
      return (
        u.email.toLowerCase().includes(q) ||
        (u.name ?? '').toLowerCase().includes(q)
      );
    })
    .slice(0, 8);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">财务访问授权</h1>
        <p className="mt-1 text-sm text-slate-500">
          决定谁能看 / 改 <code className="rounded bg-slate-100 px-1">/finance</code> 财务模块。
          默认全员无权 —— 列表外的人**连入口都看不见**。
        </p>
      </header>

      {/* 当前有权限的人 */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
          当前有权限（{users.length}）
        </h2>
        {users.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-400">仅老板（SUPER_ADMIN 自动有权）</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium text-slate-800">{u.name ?? u.email}</div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  {u.role === 'SUPER_ADMIN' ? (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700 ring-1 ring-rose-200">
                      👑 老板（自动 EDITOR）
                    </span>
                  ) : (
                    <>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ring-1 ${
                          u.financeRole === 'EDITOR'
                            ? 'bg-amber-50 text-amber-700 ring-amber-200'
                            : 'bg-sky-50 text-sky-700 ring-sky-200'
                        }`}
                      >
                        {u.financeRole === 'EDITOR' ? '✏️ 可读写' : '👁 只读'}
                      </span>
                      {u.financeRole === 'VIEWER' ? (
                        <button
                          onClick={() => setRole(u.id, 'EDITOR')}
                          disabled={busy}
                          className="text-xs text-slate-600 hover:text-slate-900 hover:underline"
                        >
                          升级为可读写
                        </button>
                      ) : (
                        <button
                          onClick={() => setRole(u.id, 'VIEWER')}
                          disabled={busy}
                          className="text-xs text-slate-600 hover:text-slate-900 hover:underline"
                        >
                          降级为只读
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (!confirm(`确定收回 ${u.name ?? u.email} 的财务权限？`)) return;
                          setRole(u.id, null);
                        }}
                        disabled={busy}
                        className="text-xs text-rose-600 hover:text-rose-800 hover:underline"
                      >
                        收回
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 添加新成员 */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">授予新人权限</h2>
        <p className="mb-3 text-xs text-slate-500">
          搜员工姓名或邮箱，找到后选 "只读" 或 "可读写"。<strong>出纳 → 只读</strong>。
        </p>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="输入姓名 / 邮箱关键字..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring focus:ring-amber-200"
        />
        {candidates.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/50">
            {candidates.map((u) => (
              <li key={u.id} className="flex items-center justify-between px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800">{u.name ?? u.email}</div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRole(u.id, 'VIEWER')}
                    disabled={busy}
                    className="rounded-lg bg-sky-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-sky-700 disabled:opacity-50"
                  >
                    👁 只读
                  </button>
                  <button
                    onClick={() => setRole(u.id, 'EDITOR')}
                    disabled={busy}
                    className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
                  >
                    ✏️ 可读写
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {search && candidates.length === 0 && (
          <div className="mt-3 text-xs text-slate-400">无匹配的员工</div>
        )}
      </section>

      {msg && (
        <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{msg}</div>
      )}
    </main>
  );
}
