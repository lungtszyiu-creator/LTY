'use client';

import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Nav() {
  const { data } = useSession();
  const user = data?.user;
  const pathname = usePathname();
  if (!user) return null;

  const isAdmin = user.role === 'ADMIN';
  const links = [
    { href: '/dashboard', label: '看板' },
    ...(isAdmin ? [{ href: '/admin/tasks/new', label: '发布任务' }] : []),
    ...(isAdmin ? [{ href: '/admin/users', label: '用户管理' }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-900/5 bg-white/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-gradient-to-br from-slate-900 to-slate-700" />
            <span className="text-[15px] font-semibold tracking-tight">任务池</span>
          </Link>
          <nav className="flex items-center gap-1">
            {links.map((l) => {
              const active = pathname === l.href || (l.href !== '/dashboard' && pathname?.startsWith(l.href));
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-lg px-3 py-1.5 text-sm transition ${
                    active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-900/5 hover:text-slate-900'
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 sm:flex">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-400 text-xs font-semibold text-white">
              {(user.name || user.email || '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-slate-700">{user.name || user.email}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                {isAdmin ? 'Admin' : 'Member'}
              </span>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="btn btn-ghost text-xs"
          >
            退出
          </button>
        </div>
      </div>
    </header>
  );
}
