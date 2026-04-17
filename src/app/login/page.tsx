'use client';

import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

function LoginInner() {
  const { data, status } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const error = params.get('error');

  useEffect(() => {
    if (status === 'authenticated' && data?.user) router.replace('/dashboard');
  }, [status, data, router]);

  return (
    <>
      <div className="aurora" aria-hidden>
        <div className="blob" />
        <div className="blob b2" />
      </div>

      <div className="flex min-h-[80vh] items-center justify-center px-6">
        <div className="relative w-full max-w-md">
          <div className="noise glass rise relative overflow-hidden rounded-3xl p-10">
            <div className="mb-10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-slate-900 to-slate-700" />
                <span className="text-sm font-medium tracking-wide text-slate-500">TASK POOL</span>
              </div>
              <span className="text-xs text-slate-400">v1</span>
            </div>

            <h1 className="mb-2 text-3xl font-semibold tracking-tight">任务池</h1>
            <p className="mb-9 text-sm text-slate-500">
              发布 · 领取 · 完成 · 验收
            </p>

            <button
              onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
              className="group flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-medium shadow-sm transition hover:border-slate-300 hover:shadow-md"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.9 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.2 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.2 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.3l-6.2-5.2C29.4 35 26.8 36 24 36c-5.4 0-9.9-3.1-11.3-8.1l-6.6 5C9.5 39.6 16.1 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2-2 3.7-3.8 5l6.2 5.2C41.4 35.8 44 30.5 44 24c0-1.3-.1-2.3-.4-3.5z"/>
              </svg>
              使用 Google 登录
              <svg className="ml-1 h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5l7 7-7 7" /></svg>
            </button>

            {error === 'AccessDenied' && (
              <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-xs text-rose-700">
                账号未激活或无访问权限，请联系管理员。
              </div>
            )}

            <div className="mt-10 flex items-center gap-3 text-xs text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              <span>登录即代表同意任务池使用条款</span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
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
