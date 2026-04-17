import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';

const schema = z.object({
  role: z.enum(['ADMIN', 'MEMBER']).optional(),
  active: z.boolean().optional(),
  name: z.string().max(100).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  const data = schema.parse(await req.json());

  // Don't let an admin lock themselves out: block self-demote / self-deactivate
  // if they're the last active admin.
  if (params.id === admin.id && (data.role === 'MEMBER' || data.active === false)) {
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN', active: true } });
    if (adminCount <= 1)
      return NextResponse.json({ error: 'LAST_ADMIN' }, { status: 409 });
  }

  const user = await prisma.user.update({ where: { id: params.id }, data });
  return NextResponse.json(user);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (params.id === admin.id)
    return NextResponse.json({ error: 'SELF_DELETE' }, { status: 409 });
  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
