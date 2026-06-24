import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { hasMinRole, type Role } from '@/lib/auth';
import { prisma } from '@/lib/db';
import TelegramNotificationsList from './TelegramNotificationsList';

export const dynamic = 'force-dynamic';

/**
 * /admin/telegram-notifications
 *
 * 2026-06-24 加 (architecture debt 1.2):
 *   bridge 调 TG sendMessage / editMessageText 失败时,会写一行 PendingTelegramNotification.
 *   本页面给老板/管理员看这些"未送达"通知 + 一键重发(调 bridge,看板不存 bot token).
 *
 * 跟现有 /admin/notifications (NotificationLog 全员公告) 是不同 feature.
 */
export default async function AdminTelegramNotificationsPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  if (!hasMinRole(session.user.role as Role, 'ADMIN')) redirect('/dashboard');

  const [items, pendingCount] = await Promise.all([
    prisma.pendingTelegramNotification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.pendingTelegramNotification.count({
      where: { status: { in: ['PENDING', 'FAILED'] } },
    }),
  ]);

  // BigInt → string for client serialization
  const serialized = items.map((it) => ({
    id: it.id,
    source: it.source,
    botKey: it.botKey,
    method: it.method,
    chatId: it.chatId.toString(),
    messageId: it.messageId,
    text: it.text,
    parseMode: it.parseMode,
    status: it.status,
    attempts: it.attempts,
    lastError: it.lastError,
    context: it.context as Record<string, unknown> | null,
    lastTriedAt: it.lastTriedAt?.toISOString() ?? null,
    sentAt: it.sentAt?.toISOString() ?? null,
    createdAt: it.createdAt.toISOString(),
  }));

  return (
    <div className="pt-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 rise">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Telegram 未送达通知</h1>
          <p className="mt-1 text-sm text-slate-500">
            bridge 发 TG 消息失败时会落到这里。点"重发"由 bridge 用本地 bot token 重发,看板不存 token。
          </p>
        </div>
        <Link href="/admin/notifications" className="btn btn-ghost text-xs">
          → 看全员通知日志
        </Link>
      </div>

      {pendingCount > 0 && (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 rise">
          ⚠️ 当前有 <strong>{pendingCount}</strong> 条 TG 通知未送达,建议逐条 review + 重发。
        </div>
      )}

      <TelegramNotificationsList initial={serialized} />
    </div>
  );
}
