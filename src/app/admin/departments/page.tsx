import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { hasMinRole, type Role } from '@/lib/auth';
import { prisma } from '@/lib/db';
import DepartmentsClient from './DepartmentsClient';

export const dynamic = 'force-dynamic';

export default async function AdminDepartmentsPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  if (!hasMinRole(session.user.role as Role, 'ADMIN')) redirect('/dashboard');

  const [depts, users] = await Promise.all([
    prisma.department.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: {
        lead: { select: { id: true, name: true, email: true } },
        memberships: {
          include: { user: { select: { id: true, name: true, email: true, image: true } } },
        },
      },
    }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true, image: true },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    }),
  ]);

  return (
    <div className="pt-6 sm:pt-8">
      <div className="mb-5 rise sm:mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">部门管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          建立部门组织架构、指定负责人、绑定成员。部门会用于文件权限、汇报归口等场景。
        </p>
      </div>
      <DepartmentsClient
        initial={depts.map((d) => ({
          ...d,
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
        }))}
        users={users}
      />
    </div>
  );
}
