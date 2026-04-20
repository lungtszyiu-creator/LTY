import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import NewTaskForm from './NewTaskForm';

export default async function NewTaskPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  return (
    <div className="pt-8">
      <Link href="/dashboard" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-800">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" /></svg>
        返回看板
      </Link>
      <div className="mb-6 rise">
        <h1 className="text-3xl font-semibold tracking-tight">发布新任务</h1>
        <p className="mt-1 text-sm text-slate-500">填写后邮件通知所有成员，他们即可在看板领取。</p>
      </div>
      <NewTaskForm />
    </div>
  );
}
