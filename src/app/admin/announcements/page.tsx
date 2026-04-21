import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { hasMinRole, type Role } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AnnouncementsAdminClient from './AnnouncementsAdminClient';

export const dynamic = 'force-dynamic';

export default async function AdminAnnouncementsPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  if (!hasMinRole(session.user.role as Role, 'ADMIN')) redirect('/dashboard');

  const items = await prisma.announcement.findMany({
    orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      _count: { select: { readings: true } },
    },
  });
  const totalActive = await prisma.user.count({ where: { active: true } });

  return (
    <div className="pt-6 sm:pt-8">
      <div className="mb-5 rise sm:mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">公告管理</h1>
        <p className="mt-1 text-sm text-slate-500">发布公司级通知，可置顶、设有效期。</p>
      </div>
      <AnnouncementsAdminClient
        totalActive={totalActive}
        initial={items.map((a) => ({
          ...a,
          publishedAt: a.publishedAt.toISOString(),
          expiresAt: a.expiresAt?.toISOString() ?? null,
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
          readingsCount: a._count.readings,
        }))}
      />
    </div>
  );
}
