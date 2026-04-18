import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';

const schema = z.object({
  title: z.string().min(1).max(120).optional(),
  level: z.enum(['EXECUTIVE', 'MANAGER', 'STAFF']).optional(),
  department: z.string().max(60).nullable().optional(),
  coreResponsibilities: z.string().min(1).max(5000).optional(),
  kpis: z.string().min(1).max(2000).optional(),
  notInTaskPool: z.string().max(2000).nullable().optional(),
  order: z.number().int().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin();
  const data = schema.parse(await req.json());
  const p = await prisma.position.update({ where: { id: params.id }, data });
  return NextResponse.json(p);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin();
  await prisma.position.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
