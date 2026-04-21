import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';
import { resolveFolderAccess } from '@/lib/folderAccess';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const access = await resolveFolderAccess(params.id, { id: user.id, role: user.role });
  if (!access.canView) return NextResponse.json({ error: 'NO_ACCESS' }, { status: 403 });

  const [folder, files, children] = await Promise.all([
    prisma.folder.findUnique({
      where: { id: params.id },
      include: {
        department: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    }),
    prisma.attachment.findMany({
      where: { folderId: params.id },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.folder.findMany({
      where: { parentId: params.id },
      orderBy: [{ name: 'asc' }],
      include: {
        department: { select: { id: true, name: true } },
        _count: { select: { files: true, children: true } },
      },
    }),
  ]);

  if (!folder) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // Filter children by view permission.
  const allowedChildren: typeof children = [];
  for (const c of children) {
    const ca = await resolveFolderAccess(c.id, { id: user.id, role: user.role });
    if (ca.canView) allowedChildren.push(c);
  }

  return NextResponse.json({ folder, files, children: allowedChildren, access });
}

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  visibility: z.enum(['INHERIT', 'PUBLIC', 'DEPARTMENT', 'PRIVATE']).optional(),
  departmentId: z.string().nullable().optional(),
  memberIds: z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const access = await resolveFolderAccess(params.id, { id: user.id, role: user.role });
  if (!access.canEdit) return NextResponse.json({ error: 'NO_EDIT' }, { status: 403 });

  const data = patchSchema.parse(await req.json());
  const { memberIds, ...rest } = data;

  const updated = await prisma.$transaction(async (tx) => {
    const f = await tx.folder.update({ where: { id: params.id }, data: rest });
    if (memberIds) {
      const existing = await tx.folderMember.findMany({ where: { folderId: params.id } });
      const existingIds = new Set(existing.map((m) => m.userId));
      const target = new Set(memberIds);
      const toRemove = existing.filter((m) => !target.has(m.userId)).map((m) => m.id);
      const toAdd = memberIds.filter((u) => !existingIds.has(u));
      if (toRemove.length) await tx.folderMember.deleteMany({ where: { id: { in: toRemove } } });
      if (toAdd.length) {
        await tx.folderMember.createMany({
          data: toAdd.map((userId) => ({ folderId: params.id, userId, access: 'VIEW' })),
          skipDuplicates: true,
        });
      }
    }
    return f;
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const access = await resolveFolderAccess(params.id, { id: user.id, role: user.role });
  if (!access.canEdit) return NextResponse.json({ error: 'NO_EDIT' }, { status: 403 });
  await prisma.folder.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
