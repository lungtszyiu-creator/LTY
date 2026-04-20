import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { hasMinRole, type Role } from '@/lib/auth';
import { prisma } from '@/lib/db';
import PenaltiesAdminClient from './PenaltiesAdminClient';

export const dynamic = 'force-dynamic';

export default async function AdminPenaltiesPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  if (!hasMinRole(session.user.role as Role, 'ADMIN')) redirect('/dashboard');

  const [items, users] = await Promise.all([
    prisma.penalty.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        issuedBy: { select: { id: true, name: true, email: true } },
        revokedBy: { select: { id: true, name: true, email: true } },
        task: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <div className="pt-6 sm:pt-8">
      <div className="mb-5 rise sm:mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">扣罚记录</h1>
        <p className="mt-1 text-sm text-slate-500">
          领取任务浪费时间 / 未按时交付 / 其他失职行为都可以登记。扣罚将影响战功榜净分与年度考核。撤销需写明理由，记录永不删除。
        </p>
      </div>

      <PenaltiesAdminClient
        initial={items.map((p) => ({
          ...p,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
          revokedAt: p.revokedAt?.toISOString() ?? null,
        }))}
        users={users.filter((u) => u.id !== session.user.id)}
      />
    </div>
  );
}
