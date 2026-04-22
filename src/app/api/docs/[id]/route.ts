import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';
import { resolveDocAccess } from '@/lib/docAccess';

// GET single doc with full body. Only callers with canView see content.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const access = await resolveDocAccess(params.id, { id: user.id, role: user.role });
  if (!access.canView) {
    return NextResponse.json({ error: 'FORBIDDEN', reason: access.reason }, { status: 403 });
  }
  const doc = await prisma.doc.findUnique({
    where: { id: params.id },
    include: {
      creator:    { select: { id: true, name: true, email: true } },
      lastEditor: { select: { id: true, name: true, email: true } },
      department: { select: { id: true, name: true } },
      members: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });
  if (!doc) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ...doc, canEdit: access.canEdit });
}

const patchSchema = z.object({
  title: z.string().max(200).optional(),
  bodyJson: z.string().optional(),
  bodyText: z.string().optional(),
  icon: z.string().max(10).nullable().optional(),
  parentId: z.string().nullable().optional(),
  visibility: z.enum(['PUBLIC', 'DEPARTMENT', 'PRIVATE']).optional(),
  departmentId: z.string().nullable().optional(),
  memberIds: z.array(z.object({
    userId: z.string(),
    access: z.enum(['VIEW', 'EDIT']),
  })).optional(),
  snapshot: z.boolean().optional(),
});

// PATCH — used for both autosave (bodyJson/bodyText + title) and permission
// changes. Creates a DocVersion snapshot when snapshot=true so the version
// rail has something to show without us writing a row on every keystroke.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const access = await resolveDocAccess(params.id, { id: user.id, role: user.role });
  if (!access.canEdit) {
    return NextResponse.json({ error: 'NO_EDIT', reason: access.reason }, { status: 403 });
  }
  const data = patchSchema.parse(await req.json());
  const { memberIds, snapshot, ...rest } = data;

  const before = await prisma.doc.findUnique({ where: { id: params.id } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const updated = await prisma.$transaction(async (tx) => {
    const d = await tx.doc.update({
      where: { id: params.id },
      data: {
        ...rest,
        lastEditorId: user.id,
      },
    });

    // Private members sync — only applies when PATCH includes memberIds.
    if (memberIds) {
      const existing = await tx.docMember.findMany({ where: { docId: params.id } });
      const targetIds = new Set(memberIds.map((m) => m.userId));
      const toDelete = existing.filter((e) => !targetIds.has(e.userId)).map((e) => e.id);
      if (toDelete.length) await tx.docMember.deleteMany({ where: { id: { in: toDelete } } });
      for (const m of memberIds) {
        await tx.docMember.upsert({
          where: { docId_userId: { docId: params.id, userId: m.userId } },
          create: { docId: params.id, userId: m.userId, access: m.access },
          update: { access: m.access },
        });
      }
    }

    // Version snapshot — capture current body as a rollback point. Prune
    // older snapshots so we keep at most 30 per doc; more than that and
    // storage grows without adding real value for a small team.
    if (snapshot) {
      await tx.docVersion.create({
        data: {
          docId: params.id,
          title: d.title,
          bodyJson: d.bodyJson,
          createdById: user.id,
        },
      });
      const all = await tx.docVersion.findMany({
        where: { docId: params.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (all.length > 30) {
        const toPrune = all.slice(30).map((r) => r.id);
        await tx.docVersion.deleteMany({ where: { id: { in: toPrune } } });
      }
    }

    return d;
  });

  return NextResponse.json(updated);
}

// DELETE — soft delete (sets deletedAt). Hard delete only for creator or
// SUPER_ADMIN via ?hard=1; cascade handled by Prisma onDelete.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const access = await resolveDocAccess(params.id, { id: user.id, role: user.role });
  if (!access.canEdit) {
    return NextResponse.json({ error: 'NO_EDIT' }, { status: 403 });
  }
  const hard = new URL(req.url).searchParams.get('hard') === '1';
  const doc = await prisma.doc.findUnique({ where: { id: params.id } });
  if (!doc) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (hard) {
    if (user.role !== 'SUPER_ADMIN' && doc.creatorId !== user.id) {
      return NextResponse.json({ error: 'SUPER_ADMIN_OR_CREATOR_ONLY' }, { status: 403 });
    }
    await prisma.doc.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true, hard: true });
  }
  await prisma.doc.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
