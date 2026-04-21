import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser, requireAdmin } from '@/lib/permissions';

export async function GET() {
  await requireUser();
  const boards = await prisma.projectBoard.findMany({
    where: { active: true },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });
  return NextResponse.json(boards);
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  iframeUrl: z.string().url(),
  description: z.string().max(1000).optional().nullable(),
  icon: z.string().max(10).optional().nullable(),
  order: z.number().int().optional(),
});

export async function POST(req: NextRequest) {
  await requireAdmin();
  const data = createSchema.parse(await req.json());
  const board = await prisma.projectBoard.create({
    data: {
      name: data.name,
      iframeUrl: data.iframeUrl,
      description: data.description ?? null,
      icon: data.icon ?? null,
      order: data.order ?? 0,
    },
  });
  return NextResponse.json(board, { status: 201 });
}
