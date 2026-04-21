import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { hasMinRole, type Role } from '@/lib/auth';
import { prisma } from '@/lib/db';
import ProjectsAdminClient from './ProjectsAdminClient';

export const dynamic = 'force-dynamic';

export default async function AdminProjectsPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  if (!hasMinRole(session.user.role as Role, 'ADMIN')) redirect('/dashboard');

  const boards = await prisma.projectBoard.findMany({
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });

  return (
    <div className="pt-6 sm:pt-8">
      <div className="mb-5 rise sm:mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">项目看板配置</h1>
        <p className="mt-1 text-sm text-slate-500">
          把 Jira / Airtable / Notion / Trello / Lark 多维表 等外部看板的嵌入链接粘到这里，前台 /projects 会自动展示 Tab。
        </p>
      </div>
      <ProjectsAdminClient
        initial={boards.map((b) => ({
          ...b,
          createdAt: b.createdAt.toISOString(),
          updatedAt: b.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
