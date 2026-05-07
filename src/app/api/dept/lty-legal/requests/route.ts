/**
 * LTY 法务部 · 需求工单 API
 *
 * GET  /api/dept/lty-legal/requests — 列表（人 session OR LTY_LEGAL_READONLY）
 * POST /api/dept/lty-legal/requests — AI 创建工单（LTY_LEGAL_AI:legal_clerk / LTY_LEGAL_ADMIN）
 *
 * 与 mc-legal/requests 物理隔离 —— 操作 LtyLegalRequest 不操作 McLegalRequest。
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireDeptAuthOrApiKey } from '@/lib/dept-access';
import { logAiActivity } from '@/lib/ai-log';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireDeptAuthOrApiKey(req, 'lty-legal', [
    'LTY_LEGAL_AI:legal_clerk',
    'LTY_LEGAL_AI:assistant',
    'LTY_LEGAL_READONLY',
  ]);
  if (auth instanceof NextResponse) return auth;

  const status = req.nextUrl.searchParams.get('status');
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '50'), 200);
  const where: { status?: string } = {};
  if (status) where.status = status;

  const requests = await prisma.ltyLegalRequest.findMany({
    where,
    take: limit,
    orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
    include: {
      requester: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
  });
  return NextResponse.json({ requests, _auth: auth.kind });
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional().nullable(),
  category: z
    .enum(['CONTRACT_REVIEW', 'IP', 'COMPLIANCE', 'DISPUTE', 'OTHER'])
    .optional()
    .nullable(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  requesterId: z.string().min(1), // AI 提交时必须指定原始发起人 User.id（不是 AI 自己）
  assigneeId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  vaultPath: z.string().max(500).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const auth = await requireDeptAuthOrApiKey(
    req,
    'lty-legal',
    ['LTY_LEGAL_AI:legal_clerk'],
    'EDIT',
  );
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'VALIDATION_FAILED',
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const aiRole = auth.kind === 'apikey' ? auth.ctx.scope.replace('LTY_LEGAL_AI:', '') : null;

  // session 路径用 session.userId 作 requester；apikey 路径用 body.requesterId
  const requesterId =
    auth.kind === 'session' ? auth.userId : d.requesterId.trim();

  const created = await prisma.ltyLegalRequest.create({
    data: {
      title: d.title,
      description: d.description?.trim() || null,
      category: d.category || null,
      priority: d.priority,
      status: 'OPEN',
      requesterId,
      assigneeId: d.assigneeId?.trim() || null,
      notes: d.notes?.trim() || null,
      vaultPath: d.vaultPath?.trim() || null,
      createdByAi: aiRole,
    },
  });

  if (auth.kind === 'apikey') {
    await logAiActivity({
      aiRole: aiRole ?? 'unknown',
      action: 'create_lty_legal_request',
      apiKeyId: auth.ctx.apiKeyId,
      payload: { id: created.id, title: created.title, priority: created.priority },
    });
  }

  return NextResponse.json(created, { status: 201 });
}
