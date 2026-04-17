'use client';

import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';

export default function Nav() {
  const { data } = useSession();
  const user = data?.user;
  if (!user) return null;

  const isAdmin = user.role === 'ADMIN';

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-semibold">任务池</Link>
          <Link href="/dashboard" className="text-sm text-slate-600 hover:text-slate-900">看板</Link>
          {isAdmin && (
            <>
              <Link href="/admin/tasks/new" className="text-sm text-slate-600 hover:text-slate-900">发布任务</Link>
              <Link href="/admin/users" className="text-sm text-slate-600 hover:text-slate-900">用户管理</Link>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden sm:inline text-slate-600">
            {user.name || user.email}
            <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {isAdmin ? '管理员' : '成员'}
            </span>
          </span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="rounded border px-3 py-1 text-slate-600 hover:bg-slate-50"
          >
            退出
          </button>
        </div>
      </div>
    </header>
  );
}
