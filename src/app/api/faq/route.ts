import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser, requireAdmin } from '@/lib/permissions';

export async function GET() {
  await requireUser();
  const items = await prisma.fAQ.findMany({
    where: { active: true },
    orderBy: [{ category: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
  });
  return NextResponse.json(items);
}

const schema = z.object({
  category: z.enum(['TASK_POOL', 'COMP', 'PROCESS', 'OTHER']).default('TASK_POOL'),
  question: z.string().min(1).max(300),
  answer: z.string().min(1).max(5000),
  order: z.number().int().optional(),
});

export async function POST(req: NextRequest) {
  await requireAdmin();
  const data = schema.parse(await req.json());
  const f = await prisma.fAQ.create({
    data: { category: data.category, question: data.question, answer: data.answer, order: data.order ?? 0 },
  });
  return NextResponse.json(f, { status: 201 });
}
