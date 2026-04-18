import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';

const schema = z.object({
  category: z.enum(['TASK_POOL', 'COMP', 'PROCESS', 'OTHER']).optional(),
  question: z.string().min(1).max(300).optional(),
  answer: z.string().min(1).max(5000).optional(),
  order: z.number().int().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin();
  const data = schema.parse(await req.json());
  const f = await prisma.fAQ.update({ where: { id: params.id }, data });
  return NextResponse.json(f);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin();
  await prisma.fAQ.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
