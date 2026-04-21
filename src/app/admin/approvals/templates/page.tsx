import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { hasMinRole, type Role } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { APPROVAL_CATEGORY_META } from '@/lib/approvalFlow';
import TemplateListClient from './TemplateListClient';

export const dynamic = 'force-dynamic';

export default async function AdminApprovalTemplatesPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  if (!hasMinRole(session.user.role as Role, 'ADMIN')) redirect('/dashboard');

  const items = await prisma.approvalTemplate.findMany({
    orderBy: [{ active: 'desc' }, { category: 'asc' }, { name: 'asc' }],
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      _count: { select: { instances: true } },
    },
  });

  return (
    <div className="pt-6 sm:pt-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 rise sm:mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">审批模板</h1>
          <p className="mt-1 text-sm text-slate-500">
            拖拽式流程编辑 + 自定义表单字段 · 员工基于这些模板发起申请。
          </p>
        </div>
        <Link href="/approvals" className="btn btn-ghost text-xs">← 返回审批中心</Link>
      </div>
      <TemplateListClient
        initial={items.map((t) => ({
          ...t,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
          categoryMeta: APPROVAL_CATEGORY_META[t.category] ?? APPROVAL_CATEGORY_META.OTHER,
          instanceCount: t._count.instances,
        }))}
      />
    </div>
  );
}
