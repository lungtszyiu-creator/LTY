import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { hasMinRole, type Role } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NOTIFICATION_KINDS } from '@/lib/notificationSettings';
import SettingsClient from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function NotificationSettingsPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  if (!hasMinRole(session.user.role as Role, 'ADMIN')) redirect('/dashboard');

  const [rows, users] = await Promise.all([
    prisma.notificationSetting.findMany(),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: 'asc' }],
    }),
  ]);
  const byKind = new Map(rows.map((r) => [r.kind, r]));

  const items = NOTIFICATION_KINDS.map((m) => {
    const row = byKind.get(m.kind);
    let extraUserIds: string[] = [];
    try { const v = JSON.parse(row?.extraUserIds ?? '[]'); if (Array.isArray(v)) extraUserIds = v; } catch {}
    return {
      kind: m.kind,
      label: m.label,
      defaultAudience: m.defaultAudience,
      enabled: row?.enabled ?? true,
      extraUserIds,
    };
  });

  return (
    <div className="pt-6 sm:pt-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 rise sm:mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">通知设置</h1>
          <p className="mt-1 text-sm text-slate-500">
            每类通知可单独开关，或追加 cc 的成员（比如公告想额外发给市场部总监）。
            默认收件人由代码决定，追加的收件人会合并进去。
          </p>
        </div>
        <Link href="/admin/notifications" className="btn btn-ghost text-xs">← 通知日志</Link>
      </div>

      <SettingsClient initial={items} users={users} />
    </div>
  );
}
