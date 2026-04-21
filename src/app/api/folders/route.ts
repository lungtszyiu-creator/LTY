import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';
import { resolveFolderAccess } from '@/lib/folderAccess';

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const parentId = req.nextUrl.searchParams.get('parentId'); // null = root
  const folders = await prisma.folder.findMany({
    where: { parentId: parentId || null },
    orderBy: [{ name: 'asc' }],
    include: {
      department: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      _count: { select: { files: true, children: true } },
    },
  });
  // Filter by view permission.
  const allowed: typeof folders = [];
  for (const f of folders) {
    const access = await resolveFolderAccess(f.id, { id: user.id, role: user.role });
    if (access.canView) allowed.push(f);
  }
  return NextResponse.json(allowed);
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  parentId: z.string().optional().nullable(),
  visibility: z.enum(['INHERIT', 'PUBLIC', 'DEPARTMENT', 'PRIVATE']).optional(),
  departmentId: z.string().optional().nullable(),
  memberIds: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const data = createSchema.parse(await req.json());

  // For non-root folders, you need edit permission on parent.
  if (data.parentId) {
    const access = await resolveFolderAccess(data.parentId, { id: user.id, role: user.role });
    if (!access.canEdit) {
      return NextResponse.json({ error: 'NO_EDIT_PERMISSION_ON_PARENT' }, { status: 403 });
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const folder = await tx.folder.create({
      data: {
        name: data.name,
        parentId: data.parentId || null,
        visibility: data.visibility ?? 'INHERIT',
        departmentId: data.departmentId || null,
        createdById: user.id,
      },
    });
    if (data.memberIds?.length) {
      await tx.folderMember.createMany({
        data: data.memberIds.map((userId) => ({ folderId: folder.id, userId, access: 'VIEW' })),
        skipDuplicates: true,
      });
    }
    return folder;
  });
  return NextResponse.json(created, { status: 201 });
}
