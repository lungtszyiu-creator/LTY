import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser, requireAdmin } from '@/lib/permissions';

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(20000).optional(),
  pinned: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin();
  const data = patchSchema.parse(await req.json());
  const updated = await prisma.announcement.update({
    where: { id: params.id },
    data: {
      ...data,
      expiresAt: data.expiresAt === undefined ? undefined : data.expiresAt ? new Date(data.expiresAt) : null,
    },
  });
  return NextResponse.json(updated);
}

// Delete restricted to SUPER_ADMIN or the announcement author. Regular ADMINs
// (department admins etc.) should not be able to wipe announcements they did
// not publish — prevents accidental or malicious removal of official notices.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const ann = await prisma.announcement.findUnique({ where: { id: params.id } });
  if (!ann) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const isSuper = user.role === 'SUPER_ADMIN';
  const isAuthor = ann.createdById === user.id;
  if (!isSuper && !isAuthor) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  await prisma.announcement.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
