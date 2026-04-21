'use client';

import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

// Keep the nav tight and symmetrical: just 4 top-level links for everyone.
// Admin-only destinations live under a "管理" dropdown so they don't push the
// layout around and labels stay perfectly aligned on the row.
const PUBLIC_LINKS = [
  { href: '/dashboard',     label: '任务' },
  { href: '/approvals',     label: '审批' },
  { href: '/announcements', label: '公告' },
  { href: '/reports',       label: '汇报' },
  { href: '/files',         label: '文件' },
];

const MORE_LINKS = [
  { href: '/projects',    label: '项目' },
  { href: '/leaderboard', label: '战功榜' },
  { href: '/rewards',     label: '我的奖励' },
  { href: '/faq',         label: 'Q&A' },
  { href: '/positions',   label: '岗位' },
];

const ADMIN_LINKS = [
  { href: '/admin/tasks/new',            label: '发布任务' },
  { href: '/admin/approvals/templates',  label: '审批模板' },
  { href: '/admin/announcements',        label: '公告管理' },
  { href: '/admin/reports',              label: '汇报汇总' },
  { href: '/admin/projects',             label: '项目看板配置' },
  { href: '/admin/departments',          label: '部门管理' },
  { href: '/admin/rewards',              label: '奖励发放' },
  { href: '/admin/penalties',            label: '扣罚登记' },
  { href: '/admin/users',                label: '用户管理' },
  { href: '/admin/notifications',        label: '通知日志' },
];

export default function Nav() {
  const { data } = useSession();
  const user = data?.user;
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const adminRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setOpen(false); setAdminOpen(false); setMoreOpen(false); }, [pathname]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!adminRef.current?.contains(e.target as Node)) setAdminOpen(false);
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    }
    if (adminOpen || moreOpen) {
      document.addEventListener('mousedown', onDoc);
      return () => document.removeEventListener('mousedown', onDoc);
    }
  }, [adminOpen, moreOpen]);

  if (!user) return null;

  const isSuper = user.role === 'SUPER_ADMIN';
  const isAdmin = isSuper || user.role === 'ADMIN';
  const roleLabel = isSuper ? '总管' : isAdmin ? '管理员' : '成员';

  const adminActive = ADMIN_LINKS.some((l) => pathname === l.href || pathname?.startsWith(l.href));
  const moreActive = MORE_LINKS.some((l) => pathname === l.href || pathname?.startsWith(l.href));

  return (
    <header
      className="sticky top-0 z-40 border-b border-slate-900/5 bg-white/75 backdrop-blur-xl"
      // PWA mode (added to iOS home screen) with statusBarStyle=black-translucent
      // lets content render under the status bar by default, so the nav ends up
      // behind the time/battery and is untappable. env(safe-area-inset-top) is
      // the iOS-supplied value for the notch/status-bar height.
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-4 px-4 sm:gap-6 sm:px-6">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-3">
          <Logo />
          <div className="flex items-baseline gap-2.5 whitespace-nowrap">
            <span className="text-[15px] font-semibold tracking-tight">LTY 旭珑</span>
            <span className="h-3.5 w-px bg-slate-300/70" />
            <span className="text-[13px] tracking-wide text-slate-500">任务池</span>
          </div>
        </Link>

        {/* Desktop nav: fixed-sized pill row so items stay aligned regardless of label length */}
        <nav className="hidden items-center gap-1 md:flex">
          {PUBLIC_LINKS.map((l) => (
            <NavLink key={l.href} href={l.href} active={pathname === l.href || (l.href !== '/dashboard' && !!pathname?.startsWith(l.href))}>
              {l.label}
            </NavLink>
          ))}
          <div ref={moreRef} className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              className={`relative inline-flex items-center gap-1 rounded-lg px-3.5 py-1.5 text-sm transition ${
                moreActive
                  ? 'text-amber-50 shadow-[0_6px_16px_-6px_rgba(139,30,42,0.55),inset_0_1px_0_rgba(245,230,200,0.3)]'
                  : 'text-slate-600 hover:bg-amber-100/30 hover:text-slate-900'
              }`}
              style={moreActive ? { background: 'linear-gradient(135deg, #6b1028 0%, #3a0a14 55%, #1a0f0a 100%)' } : undefined}
            >
              更多
              <svg className={`h-3 w-3 transition ${moreOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-full z-20 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur-xl rise">
                <ul className="py-1">
                  {MORE_LINKS.map((l) => {
                    const active = pathname === l.href || pathname?.startsWith(l.href);
                    return (
                      <li key={l.href}>
                        <Link
                          href={l.href}
                          onClick={() => setMoreOpen(false)}
                          className={`flex items-center justify-between px-4 py-2 text-sm transition ${
                            active ? 'bg-amber-50 text-amber-900' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {l.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
          {isAdmin && (
            <div ref={adminRef} className="relative">
              <button
                type="button"
                onClick={() => setAdminOpen((v) => !v)}
                aria-expanded={adminOpen}
                className={`relative inline-flex items-center gap-1 rounded-lg px-3.5 py-1.5 text-sm transition ${
                  adminActive
                    ? 'text-amber-50 shadow-[0_6px_16px_-6px_rgba(139,30,42,0.55),inset_0_1px_0_rgba(245,230,200,0.3)]'
                    : 'text-slate-600 hover:bg-amber-100/30 hover:text-slate-900'
                }`}
                style={adminActive ? { background: 'linear-gradient(135deg, #6b1028 0%, #3a0a14 55%, #1a0f0a 100%)' } : undefined}
              >
                管理
                <svg className={`h-3 w-3 transition ${adminOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {adminOpen && (
                <div className="absolute right-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur-xl rise">
                  <ul className="py-1">
                    {ADMIN_LINKS.map((l) => {
                      const active = pathname === l.href || pathname?.startsWith(l.href);
                      return (
                        <li key={l.href}>
                          <Link
                            href={l.href}
                            onClick={() => setAdminOpen(false)}
                            className={`flex items-center justify-between px-4 py-2 text-sm transition ${
                              active ? 'bg-amber-50 text-amber-900' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {l.label}
                            {active && <span className="text-xs">·</span>}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </nav>

        {/* Desktop user area */}
        <div className="hidden items-center gap-3 md:flex">
          <Avatar name={user.name || user.email || '?'} />
          <div className="flex items-baseline gap-2 whitespace-nowrap text-sm">
            <span className="max-w-[120px] truncate font-medium text-slate-800">{user.name || user.email}</span>
            <span className="rounded-full bg-amber-100/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-amber-800 ring-1 ring-amber-200/60">
              {roleLabel}
            </span>
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
          <nav className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
            <ul className="space-y-1">
              {PUBLIC_LINKS.map((l) => (
                <MobileLink key={l.href} href={l.href} active={pathname === l.href}>{l.label}</MobileLink>
              ))}
              <li className="mt-3 px-3 pb-1 text-[10px] uppercase tracking-[0.2em] text-slate-400">更多</li>
              {MORE_LINKS.map((l) => (
                <MobileLink key={l.href} href={l.href} active={pathname === l.href}>{l.label}</MobileLink>
              ))}
              {isAdmin && (
                <>
                  <li className="mt-3 px-3 pb-1 text-[10px] uppercase tracking-[0.2em] text-slate-400">管理</li>
                  {ADMIN_LINKS.map((l) => (
                    <MobileLink key={l.href} href={l.href} active={pathname === l.href}>{l.label}</MobileLink>
                  ))}
                </>
              )}
            </ul>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar name={user.name || user.email || '?'} />
                <div className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-sm font-medium text-slate-800">{user.name || user.email}</span>
                  <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{roleLabel}</span>
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

function MobileLink({ href, children, active }: { href: string; children: React.ReactNode; active: boolean }) {
  return (
    <li>
      <Link
        href={href}
        className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm transition ${
          active
            ? 'text-amber-50 shadow-[0_6px_14px_-6px_rgba(139,30,42,0.45),inset_0_1px_0_rgba(245,230,200,0.25)]'
            : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-amber-50'
        }`}
        style={active ? { background: 'linear-gradient(135deg, #6b1028 0%, #3a0a14 55%, #1a0f0a 100%)' } : undefined}
      >
        <span>{children}</span>
        <svg className="h-4 w-4 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5l7 7-7 7" /></svg>
      </Link>
    </li>
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
