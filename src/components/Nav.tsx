'use client';

import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Nav() {
  const { data } = useSession();
  const user = data?.user;
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [pathname]);

  if (!user) return null;

  const isAdmin = user.role === 'ADMIN';
  const links = [
    { href: '/dashboard', label: '看板' },
    ...(isAdmin ? [{ href: '/admin/tasks/new', label: '发布任务' }] : []),
    ...(isAdmin ? [{ href: '/admin/users', label: '用户管理' }] : []),
  ];

  const activeHref = links.find((l) => pathname === l.href || (l.href !== '/dashboard' && pathname?.startsWith(l.href)))?.href;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-900/5 bg-white/75 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-6 px-5 sm:px-6">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-3">
          <Logo />
          <div className="flex items-baseline gap-2.5 whitespace-nowrap">
            <span className="text-[15px] font-semibold tracking-tight">LTY 旭珑</span>
            <span className="h-3.5 w-px bg-slate-300/70" />
            <span className="text-[13px] tracking-wide text-slate-500">任务池</span>
          </div>
        </Link>

        {/* Desktop links */}
        <nav className="hidden items-center gap-1.5 md:flex">
          {links.map((l) => (
            <NavLink key={l.href} href={l.href} active={activeHref === l.href}>
              {l.label}
            </NavLink>
          ))}
        </nav>

        {/* Desktop user area */}
        <div className="hidden items-center gap-4 md:flex">
          <div className="flex items-center gap-2.5">
            <Avatar name={user.name || user.email || '?'} />
            <div className="flex items-baseline gap-2 whitespace-nowrap text-sm">
              <span className="font-medium text-slate-800">{user.name || user.email}</span>
              <span className="rounded-full bg-amber-100/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-amber-800 ring-1 ring-amber-200/60">
                {isAdmin ? 'Admin' : 'Member'}
              </span>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="btn btn-ghost px-3 py-1.5 text-xs"
          >
            退出
          </button>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="菜单"
          aria-expanded={open}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 transition hover:bg-amber-100/30 md:hidden"
        >
          {open ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" /></svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16M4 12h16M4 17h16" /></svg>
          )}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="border-t border-slate-900/5 bg-white/95 backdrop-blur-xl md:hidden">
          <nav className="mx-auto max-w-6xl px-5 py-3">
            <ul className="space-y-1">
              {links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm transition ${
                      activeHref === l.href
                        ? 'text-amber-50 shadow-[0_6px_14px_-6px_rgba(139,30,42,0.45),inset_0_1px_0_rgba(245,230,200,0.25)]'
                        : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-amber-50'
                    }`}
                    style={activeHref === l.href ? { background: 'linear-gradient(135deg, #6b1028 0%, #3a0a14 55%, #1a0f0a 100%)' } : undefined}
                  >
                    <span>{l.label}</span>
                    <svg className="h-4 w-4 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5l7 7-7 7" /></svg>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar name={user.name || user.email || '?'} />
                <div className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-sm font-medium text-slate-800">{user.name || user.email}</span>
                  <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                    {isAdmin ? 'Admin' : 'Member'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="btn btn-ghost shrink-0 px-3 py-1.5 text-xs"
              >
                退出
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

function NavLink({ href, children, active }: { href: string; children: React.ReactNode; active: boolean }) {
  return (
    <Link
      href={href}
      className={`relative rounded-lg px-3.5 py-1.5 text-sm transition ${
        active
          ? 'text-amber-50 shadow-[0_6px_16px_-6px_rgba(139,30,42,0.55),inset_0_1px_0_rgba(245,230,200,0.3)]'
          : 'text-slate-600 hover:bg-amber-100/30 hover:text-slate-900'
      }`}
      style={active ? { background: 'linear-gradient(135deg, #6b1028 0%, #3a0a14 55%, #1a0f0a 100%)' } : undefined}
    >
      {children}
    </Link>
  );
}

function Logo() {
  return (
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
      <div className="absolute inset-[-4px] rounded-full bg-[radial-gradient(closest-side,rgba(212,165,116,0.38),transparent_72%)] blur-[3px]" aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="LTY 旭珑" className="relative h-full w-full object-contain drop-shadow-[0_3px_8px_rgba(139,30,42,0.2)]" />
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-rose-400 to-red-700 text-xs font-semibold text-white ring-1 ring-white/60">
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
