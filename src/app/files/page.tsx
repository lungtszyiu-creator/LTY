import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { resolveFolderAccess } from '@/lib/folderAccess';
import FilesClient from './FilesClient';

export const dynamic = 'force-dynamic';

export default async function FilesPage({
  searchParams,
}: {
  searchParams: { folder?: string };
}) {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const folderId = searchParams.folder ?? null;

  const access = folderId
    ? await resolveFolderAccess(folderId, { id: session.user.id, role: session.user.role })
    : { canView: true, canEdit: session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN', canUpload: true, effectiveFolderId: null, effectiveVisibility: 'PUBLIC' as const, reason: 'root' };

  if (folderId && !access.canView) {
    return (
      <div className="pt-8">
        <div className="card p-10 text-center">
          <div className="mb-2 text-4xl">🔒</div>
          <p className="text-slate-700">你没有这个文件夹的查看权限</p>
          <Link href="/files" className="mt-3 inline-block text-sm text-indigo-600 hover:underline">返回文件根目录</Link>
        </div>
      </div>
    );
  }

  const [folder, children, files, breadcrumbs, departments, users] = await Promise.all([
    folderId ? prisma.folder.findUnique({
      where: { id: folderId },
      include: {
        department: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    }) : null,
    prisma.folder.findMany({
      where: { parentId: folderId || null },
      orderBy: [{ name: 'asc' }],
      include: {
        department: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { files: true, children: true } },
      },
    }),
    prisma.attachment.findMany({
      where: { folderId: folderId || null, taskId: null, submissionId: null, rewardId: null, announcementId: null, reportId: null },
      orderBy: { createdAt: 'desc' },
    }),
    buildBreadcrumbs(folderId),
    prisma.department.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true, image: true }, orderBy: { name: 'asc' } }),
  ]);

  // Permission filter children.
  const allowedChildren: any[] = [];
  for (const c of children) {
    const ca = await resolveFolderAccess(c.id, { id: session.user.id, role: session.user.role });
    if (ca.canView) {
      allowedChildren.push({ ...c, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() });
    }
  }

  return (
    <div className="pt-6 sm:pt-8">
      <div className="mb-5 rise sm:mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">📁 文件共享</h1>
        <p className="mt-1 text-sm text-slate-500">
          建文件夹、上传文件、按部门/公开/私密配权限，子文件夹默认继承父级权限。
        </p>
      </div>

      <FilesClient
        currentFolderId={folderId}
        currentFolder={folder ? {
          ...folder,
          createdAt: folder.createdAt.toISOString(),
          updatedAt: folder.updatedAt.toISOString(),
        } : null}
        access={access}
        breadcrumbs={breadcrumbs}
        children={allowedChildren}
        files={files.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }))}
        departments={departments}
        users={users}
      />
    </div>
  );
}

async function buildBreadcrumbs(folderId: string | null) {
  if (!folderId) return [];
  const chain: { id: string; name: string }[] = [];
  let cursor: any = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { id: true, name: true, parentId: true },
  });
  while (cursor) {
    chain.unshift({ id: cursor.id, name: cursor.name });
    if (!cursor.parentId) break;
    cursor = await prisma.folder.findUnique({
      where: { id: cursor.parentId },
      select: { id: true, name: true, parentId: true },
    });
  }
  return chain;
}
