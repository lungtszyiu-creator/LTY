import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser, requireAdmin } from '@/lib/permissions';

export async function GET() {
  await requireUser();
  const depts = await prisma.department.findMany({
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    include: {
      lead: { select: { id: true, name: true, email: true } },
      memberships: {
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      },
      _count: { select: { memberships: true } },
    },
  });
  return NextResponse.json(depts);
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/),
  description: z.string().max(1000).optional().nullable(),
  leadUserId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  order: z.number().int().optional(),
});

export async function POST(req: NextRequest) {
  await requireAdmin();
  const data = createSchema.parse(await req.json());
  const dept = await prisma.department.create({
    data: {
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
      leadUserId: data.leadUserId ?? null,
      parentId: data.parentId ?? null,
      order: data.order ?? 0,
    },
  });
  return NextResponse.json(dept, { status: 201 });
}
