'use client';

/**
 * AI 部子页面下拉 nav — 老板 5/10：「干脆 ai 部也用下拉的方式放这些功能
 * 供大家使用」
 *
 * 显示 AI 部所有子页面，点击展开列表。一行展示当前页面 + 下拉切换。
 *
 * 4 项（自上而下）：
 *   AI 总览       /dept/ai
 *   AI 接入向导   /dept/ai/onboarding
 *   AI 月订阅     /dept/ai/subscriptions
 *   AI 员工档案   /employees    (仅 ADMIN+)
 *
 * 后续加页面只需在 PAGES 数组里加一行。
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type Page = {
  href: string;
  emoji: string;
  label: string;
  hint: string;
  /** 仅 ADMIN+ 可见的 admin 链接（员工档案 CRUD）— 下拉里 ADMIN 才看到 */
  adminOnly?: boolean;
};

const PAGES: Page[] = [
  { href: '/dept/ai', emoji: '📡', label: 'AI 总览', hint: 'token 看板 / 健康度 / 入账' },
  { href: '/dept/ai/onboarding', emoji: '🛠', label: 'AI 接入向导', hint: 'plugin / Coze / API 触发' },
  { href: '/dept/ai/subscriptions', emoji: '💳', label: 'AI 月订阅', hint: '全员可填月费' },
  { href: '/employees', emoji: '👥', label: 'AI 员工档案', hint: '档案 / Key 管理', adminOnly: true },
];

export function AiSubpageNav({ isAdminPlus }: { isAdminPlus: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 路径变化自动关下拉
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // 点击外面关下拉
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const visiblePages = PAGES.filter((p) => !p.adminOnly || isAdminPlus);
  const current = visiblePages.find(
    (p) => p.href === pathname || (p.href !== '/dept/ai' && pathname?.startsWith(p.href)),
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-sm font-medium text-violet-900 shadow-sm transition hover:bg-violet-50"
      >
        <span>{current?.emoji ?? '📡'}</span>
        <span>{current?.label ?? 'AI 部子页面'}</span>
        <svg
          className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <ul className="py-1">
            {visiblePages.map((p) => {
              const active = p === current;
              return (
                <li key={p.href}>
                  <Link
                    href={p.href}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className={`flex items-baseline gap-3 px-4 py-2.5 text-sm transition ${
                      active
                        ? 'bg-violet-50 text-violet-900'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="shrink-0 text-base">{p.emoji}</span>
                    <span className="min-w-0 flex-1">
                      <div className="font-medium">{p.label}</div>
                      <div className="text-[11px] text-slate-500">{p.hint}</div>
                    </span>
                    {active && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wider text-violet-700">
                        当前
                      </span>
                    )}
                    {p.adminOnly && (
                      <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 ring-1 ring-amber-300">
                        ADMIN+
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
