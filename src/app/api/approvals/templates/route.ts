import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser, requireAdmin } from '@/lib/permissions';
import { blankFlow } from '@/lib/approvalFlow';

export async function GET(req: NextRequest) {
  await requireUser();
  const activeOnly = req.nextUrl.searchParams.get('activeOnly') !== '0';
  const items = await prisma.approvalTemplate.findMany({
    where: activeOnly ? { active: true } : {},
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      _count: { select: { instances: true } },
    },
  });
  return NextResponse.json(items);
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/),
  category: z.enum(['LEAVE', 'EXPENSE', 'TRAVEL', 'PROCUREMENT', 'STAMP', 'OTHER']).optional(),
  icon: z.string().max(10).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const data = createSchema.parse(await req.json());

  // Seed a sensible default field so a blank template isn't unusable —
  // before this, creating a template and clicking 发起审批 showed an empty
  // form and the initiator had nowhere to describe their request.
  const defaultFields = [
    {
      id: `f_${Math.random().toString(36).slice(2, 8)}`,
      type: 'textarea',
      label: '申请说明',
      placeholder: '请简述申请事由、背景、需要什么',
      required: true,
      titleField: true,
    },
  ];

  const t = await prisma.approvalTemplate.create({
    data: {
      name: data.name,
      slug: data.slug,
      category: data.category ?? 'OTHER',
      icon: data.icon ?? null,
      description: data.description ?? null,
      flowJson: JSON.stringify(blankFlow()),
      fieldsJson: JSON.stringify(defaultFields),
      createdById: admin.id,
    },
  });
  return NextResponse.json(t, { status: 201 });
}
