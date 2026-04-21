import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { hasMinRole, type Role } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AnnouncementsClient from './AnnouncementsClient';

export const dynamic = 'force-dynamic';

export default async function AnnouncementsPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const isAdmin = hasMinRole(session.user.role as Role, 'ADMIN');
  const now = new Date();
  const items = await prisma.announcement.findMany({
    where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      attachments: true,
      readings: { where: { userId: session.user.id }, select: { readAt: true } },
      _count: { select: { readings: true } },
    },
  });
  const totalActive = await prisma.user.count({ where: { active: true } });

  return (
    <div className="pt-6 sm:pt-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 rise sm:mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">📢 公司公告</h1>
          <p className="mt-1 text-sm text-slate-500">
            公司级通知 · 看过请点"标记已读"，方便管理员跟进。
          </p>
        </div>
        {isAdmin && (
          <Link href="/admin/announcements" className="btn btn-primary shrink-0">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
            发布公告
          </Link>
        )}
      </div>
      <AnnouncementsClient
        totalActive={totalActive}
        meId={session.user.id}
        initial={items.map((a) => ({
          ...a,
          publishedAt: a.publishedAt.toISOString(),
          expiresAt: a.expiresAt?.toISOString() ?? null,
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
          attachments: a.attachments.map((x) => ({ ...x, createdAt: x.createdAt.toISOString() })),
          readByMe: a.readings.length > 0,
          readAtByMe: a.readings[0]?.readAt?.toISOString() ?? null,
          readingsCount: a._count.readings,
        }))}
      />
    </div>
  );
}
