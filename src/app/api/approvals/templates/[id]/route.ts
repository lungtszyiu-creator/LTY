import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser, requireAdmin } from '@/lib/permissions';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await requireUser();
  const t = await prisma.approvalTemplate.findUnique({
    where: { id: params.id },
    include: { createdBy: { select: { id: true, name: true, email: true } } },
  });
  if (!t) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json(t);
}

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  category: z.enum(['LEAVE', 'EXPENSE', 'TRAVEL', 'PROCUREMENT', 'STAMP', 'OTHER']).optional(),
  icon: z.string().max(10).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  flowJson: z.string().optional(),
  fieldsJson: z.string().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin();
  const data = patchSchema.parse(await req.json());
  const t = await prisma.approvalTemplate.update({ where: { id: params.id }, data });
  return NextResponse.json(t);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin();
  // Soft-delete by setting active=false so historical instances still point
  // at a valid template row (we already snapshot the flow, so rendering old
  // instances doesn't actually need this row, but FK integrity does).
  await prisma.approvalTemplate.update({ where: { id: params.id }, data: { active: false } });
  return NextResponse.json({ ok: true, soft: true });
}
