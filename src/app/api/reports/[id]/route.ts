import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';

// Hard delete a report. Restricted to SUPER_ADMIN — reports are official
// records and we don't want regular admins or authors wiping history.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'SUPER_ADMIN_ONLY' }, { status: 403 });
  }
  const r = await prisma.report.findUnique({ where: { id: params.id } });
  if (!r) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  await prisma.report.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
