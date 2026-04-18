'use client';

import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';

function LoginInner() {
  const { data, status } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const error = params.get('error');
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === 'authenticated' && data?.user) router.replace('/dashboard');
  }, [status, data, router]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 100;
      const y = ((e.clientY - r.top) / r.height) * 100;
      el.style.setProperty('--mx', `${x}%`);
      el.style.setProperty('--my', `${y}%`);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  return (
    <>
      <div ref={stageRef} className="aurora-stage" aria-hidden>
        <div className="rays" />
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
        <div className="blob b4" />
        <div className="spot" />
      </div>

      <div className="relative flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <div className="mb-10 flex flex-col items-center gap-5 rise">
            <div className="relative flex h-[176px] w-[176px] items-center justify-center">
              {/* Outer glow ring */}
              <div className="absolute inset-[-48px] rounded-full bg-[radial-gradient(closest-side,rgba(232,201,143,0.32),rgba(212,72,49,0.12)_50%,transparent_72%)] blur-lg" aria-hidden />
              {/* Inner halo */}
              <div className="absolute inset-[-16px] rounded-full bg-[radial-gradient(closest-side,rgba(245,230,200,0.3),transparent_70%)] blur-md" aria-hidden />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.svg"
                alt="LTY 旭珑"
                className="relative h-full w-full object-contain drop-shadow-[0_14px_40px_rgba(0,0,0,0.6)] drop-shadow-[0_0_24px_rgba(232,201,143,0.4)]"
                style={{ filter: 'brightness(1.12) saturate(1.08)' }}
              />
            </div>
            <div className="flex items-center gap-3 whitespace-nowrap">
              <span className="text-2xl font-semibold tracking-tight text-amber-50">LTY 旭珑</span>
              <span className="h-5 w-px bg-amber-100/30" />
              <span className="text-[11px] tracking-[0.32em] text-amber-100/60">TASK POOL</span>
            </div>
          </div>

          <div className="noise glass-dark relative overflow-hidden rounded-[28px] p-10 rise-scale rise-delay-1">
            <div className="mb-1 text-center text-[11px] uppercase tracking-[0.3em] text-amber-100/50">
              旭珑内部任务看板
            </div>
            <h1 className="mb-2 text-center text-4xl font-semibold tracking-tight">
              <span className="shimmer-text">任务池</span>
            </h1>
            <p className="mb-10 text-center text-sm tracking-wide text-amber-100/55">
              发布 · 领取 · 完成 · 验收
            </p>

            <button
              onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
              className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl border border-amber-200/20 bg-white/95 px-4 py-3.5 text-sm font-medium text-slate-900 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.6)] transition hover:bg-white"
            >
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-amber-200/60 to-transparent transition group-hover:translate-x-full" style={{ transitionDuration: '900ms' }} />
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.9 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.2 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.2 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.3l-6.2-5.2C29.4 35 26.8 36 24 36c-5.4 0-9.9-3.1-11.3-8.1l-6.6 5C9.5 39.6 16.1 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2-2 3.7-3.8 5l6.2 5.2C41.4 35.8 44 30.5 44 24c0-1.3-.1-2.3-.4-3.5z"/>
              </svg>
              使用 Google 登录
              <svg className="ml-1 h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5l7 7-7 7" /></svg>
            </button>

            {error === 'AccessDenied' && (
              <div className="mt-5 rounded-xl border border-rose-400/30 bg-rose-900/30 px-4 py-3 text-xs text-rose-200">
                账号未激活或无访问权限，请联系管理员。
              </div>
            )}

            <div className="mt-10 flex items-center gap-3 text-[10px] uppercase tracking-widest text-amber-100/40">
              <span className="h-px flex-1 bg-amber-100/10" />
              <span>Google SSO</span>
              <span className="h-px flex-1 bg-amber-100/10" />
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-amber-100/40 rise rise-delay-3">
            首次登录后请联系管理员激活账号
          </p>
        </div>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-slate-500">加载中…</div>}>
      <LoginInner />
    </Suspense>
  );
}
