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
    <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col items-center justify-center">
      <div className="w-full rounded-xl border bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-2xl font-semibold">任务池</h1>
        <p className="mb-6 text-sm text-slate-600">使用 Google 账号登录</p>
        <button
          onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
          className="flex w-full items-center justify-center gap-2 rounded-lg border bg-white px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-slate-50"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.9 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.2 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.2 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.3l-6.2-5.2C29.4 35 26.8 36 24 36c-5.4 0-9.9-3.1-11.3-8.1l-6.6 5C9.5 39.6 16.1 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2-2 3.7-3.8 5l6.2 5.2C41.4 35.8 44 30.5 44 24c0-1.3-.1-2.3-.4-3.5z"/>
          </svg>
          使用 Google 登录
        </button>
        {error === 'AccessDenied' && (
          <p className="mt-4 text-sm text-rose-600">
            账号未激活或无访问权限，请联系管理员。
          </p>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="py-10 text-center text-slate-500">加载中…</div>}>
      <LoginInner />
    </Suspense>
  );
}
