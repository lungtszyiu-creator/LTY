import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';
import { listVisibleDocIds } from '@/lib/docAccess';

// GET /api/docs — lightweight list used by the sidebar tree. Returns only
// metadata (no body) so the left rail loads fast even with hundreds of
// pages. Results are filtered to what the caller can actually view.
export async function GET() {
  const user = await requireUser();
  const visibleIds = await listVisibleDocIds({ id: user.id, role: user.role });
  const docs = await prisma.doc.findMany({
    where: { id: { in: Array.from(visibleIds) }, deletedAt: null },
    orderBy: [{ updatedAt: 'desc' }],
    select: {
      id: true, title: true, icon: true, parentId: true,
      visibility: true, updatedAt: true,
      creator: { select: { id: true, name: true, email: true } },
      lastEditor: { select: { id: true, name: true, email: true } },
    },
  });
  return NextResponse.json(docs);
}

const createSchema = z.object({
  title: z.string().max(200).optional(),
  icon: z.string().max(10).optional().nullable(),
  parentId: z.string().nullable().optional(),
  visibility: z.enum(['PUBLIC', 'DEPARTMENT', 'PRIVATE']).default('PUBLIC'),
  departmentId: z.string().optional().nullable(),
});

// POST /api/docs — create a blank doc. We pre-write an empty TipTap JSON
// structure so the editor doesn't crash on first load; body is updated via
// PATCH /[id] as the user types.
export async function POST(req: NextRequest) {
  const user = await requireUser();
  const data = createSchema.parse(await req.json().catch(() => ({})));

  const blankBody = JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph' }],
  });

  const doc = await prisma.doc.create({
    data: {
      title: data.title || '无标题文档',
      icon: data.icon ?? null,
      parentId: data.parentId ?? null,
      visibility: data.visibility,
      departmentId: data.visibility === 'DEPARTMENT' ? (data.departmentId ?? null) : null,
      bodyJson: blankBody,
      bodyText: '',
      creatorId: user.id,
      lastEditorId: user.id,
    },
    select: { id: true, title: true, icon: true, parentId: true, visibility: true, updatedAt: true },
  });
  return NextResponse.json(doc, { status: 201 });
}
