import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  iframeUrl: z.string().url().optional(),
  description: z.string().max(1000).nullable().optional(),
  icon: z.string().max(10).nullable().optional(),
  order: z.number().int().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin();
  const data = patchSchema.parse(await req.json());
  const updated = await prisma.projectBoard.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin();
  await prisma.projectBoard.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
