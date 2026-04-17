import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import UsersTable from './UsersTable';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/dashboard');

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, email: true, image: true,
      role: true, active: true, createdAt: true,
    },
  });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">用户管理</h1>
      <p className="mb-6 text-sm text-slate-600">
        预注册用户邮箱后，对方用 Google 登录即可直接进入。已存在用户可改角色或禁用。
      </p>
      <UsersTable
        initial={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))}
        meId={session.user.id}
      />
    </div>
  );
}
