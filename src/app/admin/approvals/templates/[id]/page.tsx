import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { hasMinRole, type Role } from '@/lib/auth';
import { prisma } from '@/lib/db';
import TemplateEditor from './TemplateEditor';

export const dynamic = 'force-dynamic';

export default async function AdminTemplateEditorPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  if (!hasMinRole(session.user.role as Role, 'ADMIN')) redirect('/dashboard');

  const [tpl, users, departments] = await Promise.all([
    prisma.approvalTemplate.findUnique({ where: { id: params.id } }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true, image: true },
      orderBy: [{ name: 'asc' }],
    }),
    prisma.department.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  if (!tpl) notFound();

  return (
    <div className="pt-6 sm:pt-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 rise">
        <div>
          <Link href="/admin/approvals/templates" className="mb-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
            ← 返回模板列表
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {tpl.icon && <span className="mr-2">{tpl.icon}</span>}
            {tpl.name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            左侧拖拽节点画流程；右侧配置表单字段。保存后员工就能在 /approvals/new 使用。
          </p>
        </div>
      </div>

      <TemplateEditor
        templateId={tpl.id}
        initialName={tpl.name}
        initialCategory={tpl.category}
        initialDescription={tpl.description ?? ''}
        initialFlow={tpl.flowJson}
        initialFields={tpl.fieldsJson}
        users={users}
        departments={departments}
      />
    </div>
  );
}
