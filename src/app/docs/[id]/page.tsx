import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { resolveDocAccess, listVisibleDocIds } from '@/lib/docAccess';
import { fmtDateTime } from '@/lib/datetime';
import DocsTree from '../DocsTree';
import CreateDocButton from '../CreateDocButton';
import DocWorkspace from './DocWorkspace';
import DocSharePanel from './DocSharePanel';

export const dynamic = 'force-dynamic';

export default async function DocPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  const me = session.user;

  const access = await resolveDocAccess(params.id, { id: me.id, role: me.role });
  if (!access.canView) {
    return (
      <div className="pt-8">
        <div className="card py-14 text-center">
          <div className="mb-2 text-4xl">🔒</div>
          <p className="text-slate-700">你没有查看这个文档的权限</p>
          <Link href="/docs" className="mt-3 inline-block text-sm text-indigo-600 hover:underline">返回文档列表</Link>
        </div>
      </div>
    );
  }

  const [doc, visibleIds, departments, users] = await Promise.all([
    prisma.doc.findUnique({
      where: { id: params.id },
      include: {
        creator:    { select: { id: true, name: true, email: true } },
        lastEditor: { select: { id: true, name: true, email: true } },
        department: { select: { id: true, name: true } },
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    }),
    listVisibleDocIds({ id: me.id, role: me.role }),
    prisma.department.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    }),
  ]);
  if (!doc) notFound();

  const allDocs = await prisma.doc.findMany({
    where: { id: { in: Array.from(visibleIds) }, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, icon: true, parentId: true, visibility: true, updatedAt: true },
  });

  // Manage = creator or SUPER_ADMIN. Regular editors can edit the body but
  // not re-share the document with new people.
  const canManageSharing = me.role === 'SUPER_ADMIN' || doc.creatorId === me.id;

  return (
    <div className="pt-4 sm:pt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rise">
        <Link href="/docs" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">← 返回文档列表</Link>
        <CreateDocButton />
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="card h-fit overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            文档树
          </div>
          <div className="max-h-[75vh] overflow-y-auto">
            <DocsTree docs={allDocs.map((d) => ({ ...d, updatedAt: d.updatedAt.toISOString() }))} />
          </div>
        </aside>

        <div className="card p-6 sm:p-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>创建：{doc.creator.name ?? doc.creator.email} · {fmtDateTime(doc.createdAt)}</span>
              {doc.lastEditor && (
                <span>· 最后编辑：{doc.lastEditor.name ?? doc.lastEditor.email} · {fmtDateTime(doc.updatedAt)}</span>
              )}
              {!access.canEdit && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2 py-0.5 text-white">只读</span>
              )}
            </div>
            <DocSharePanel
              docId={doc.id}
              canManage={canManageSharing}
              initialVisibility={doc.visibility as any}
              initialDepartmentId={doc.departmentId}
              initialMembers={doc.members.map((m) => ({ userId: m.userId, access: m.access, user: m.user }))}
              departments={departments}
              users={users}
            />
          </div>
          <DocWorkspace
            docId={doc.id}
            initialTitle={doc.title}
            initialBodyJson={doc.bodyJson}
            initialUpdatedAt={doc.updatedAt.toISOString()}
            canEdit={access.canEdit}
            meId={me.id}
          />
        </div>
      </div>
    </div>
  );
}
