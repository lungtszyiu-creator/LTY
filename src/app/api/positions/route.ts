import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser, requireAdmin } from '@/lib/permissions';

export async function GET() {
  await requireUser();
  const positions = await prisma.position.findMany({
    where: { active: true },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });
  return NextResponse.json(positions);
}

const schema = z.object({
  title: z.string().min(1).max(120),
  level: z.enum(['EXECUTIVE', 'MANAGER', 'STAFF']).default('STAFF'),
  department: z.string().max(60).optional().nullable(),
  coreResponsibilities: z.string().min(1).max(5000),
  kpis: z.string().min(1).max(2000),
  notInTaskPool: z.string().max(2000).optional().nullable(),
  order: z.number().int().optional(),
});

export async function POST(req: NextRequest) {
  await requireAdmin();
  const data = schema.parse(await req.json());
  const p = await prisma.position.create({
    data: {
      title: data.title,
      level: data.level,
      department: data.department ?? null,
      coreResponsibilities: data.coreResponsibilities,
      kpis: data.kpis,
      notInTaskPool: data.notInTaskPool ?? null,
      order: data.order ?? 0,
    },
  });
  return NextResponse.json(p, { status: 201 });
}
