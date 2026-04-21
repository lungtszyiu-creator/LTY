import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import UsersTable from './UsersTable';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, email: true, image: true,
      role: true, active: true, createdAt: true,
      annualLeaveBalance: true, compLeaveBalance: true,
    },
  });

  return (
    <div className="pt-8">
      <div className="mb-6 rise">
        <h1 className="text-3xl font-semibold tracking-tight">用户管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          预注册成员邮箱后，对方即可用 Google 登录进入。可随时改角色或禁用访问。
        </p>
      </div>
      <UsersTable
        initial={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))}
        meId={session.user.id}
        meRole={session.user.role as any}
      />
    </div>
  );
}
