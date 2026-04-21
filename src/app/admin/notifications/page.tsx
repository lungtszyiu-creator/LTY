import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { hasMinRole, type Role } from '@/lib/auth';
import { prisma } from '@/lib/db';
import NotificationsList from './NotificationsList';

export const dynamic = 'force-dynamic';

export default async function AdminNotificationsPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  if (!hasMinRole(session.user.role as Role, 'ADMIN')) redirect('/dashboard');

  const [logs, failing] = await Promise.all([
    prisma.notificationLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.notificationLog.count({
      where: { status: { in: ['FAILED', 'NOT_CONFIGURED'] } },
    }),
  ]);

  return (
    <div className="pt-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 rise">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">通知日志</h1>
          <p className="mt-1 text-sm text-slate-500">
            每次任务发布 / 提交审核通知都会留痕。有失败记录时，点右侧"重发"一键补发。
          </p>
        </div>
        <Link href="/admin/notifications/settings" className="btn btn-ghost text-xs">⚙️ 通知设置 →</Link>
      </div>

      {failing > 0 && (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 rise">
          ⚠️ 历史记录中有 <strong>{failing}</strong> 条通知失败 / 未配置，建议尽快补发。
          <Link href="/dashboard" className="ml-2 underline">返回看板</Link>
        </div>
      )}

      <NotificationsList
        initial={logs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() }))}
      />
    </div>
  );
}
