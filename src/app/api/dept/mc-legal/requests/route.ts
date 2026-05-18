/**
 * MC 法务部 · 需求工单 API
 *
 * GET  /api/dept/mc-legal/requests — 列表（人 session OR MC_LEGAL_READONLY）
 * POST /api/dept/mc-legal/requests — AI 创建工单
 *
 * 5/19 PR C：body 接受 Maggie V5 spec alias（同 lty-legal）。扩 POST scope
 * 允许 ADMIN + assistant key 调。详见 lib/legal-request-input.ts。
 *
 * 物理隔离铁律：操作 McLegalRequest，不与 LTY 共表。Coze workspace 也独立。
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireDeptAuthOrApiKey } from '@/lib/dept-access';
import { logAiActivity } from '@/lib/ai-log';
import {
  legalRequestCreateInputSchema,
  resolveLegalRequestInput,
} from '@/lib/legal-request-input';

export const dynamic = 'force-dynamic';

const POST_ALLOWED_SCOPES = [
  'MC_LEGAL_AI:legal_clerk',
  'MC_LEGAL_AI:assistant',
  'MC_LEGAL_ADMIN',
];

export async function GET(req: NextRequest) {
  const auth = await requireDeptAuthOrApiKey(req, 'mc-legal', [
    'MC_LEGAL_AI:legal_clerk',
    'MC_LEGAL_AI:assistant',
    'MC_LEGAL_READONLY',
    'MC_LEGAL_ADMIN',
  ]);
  if (auth instanceof NextResponse) return auth;

  const status = req.nextUrl.searchParams.get('status');
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '50'), 200);
  const where: { status?: string } = {};
  if (status) where.status = status;

  const requests = await prisma.mcLegalRequest.findMany({
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

export async function POST(req: NextRequest) {
  const auth = await requireDeptAuthOrApiKey(req, 'mc-legal', POST_ALLOWED_SCOPES, 'EDIT');
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const parsed = legalRequestCreateInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'VALIDATION_FAILED',
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      { status: 400 },
    );
  }

  const resolved = await resolveLegalRequestInput({
    body: parsed.data,
    expectedDeptSlug: 'mc-legal',
    sessionUserId: auth.kind === 'session' ? auth.userId : null,
  });
  if (!resolved.ok) {
    return NextResponse.json(
      {
        error: resolved.error.code,
        field: resolved.error.field,
        hint: resolved.error.hint,
        candidates: resolved.error.candidates,
      },
      { status: 422 },
    );
  }
  const d = resolved.data;

  let aiRole: string | null = null;
  if (auth.kind === 'apikey') {
    const scope = auth.ctx.scope;
    if (scope.startsWith('MC_LEGAL_AI:')) {
      aiRole = scope.slice('MC_LEGAL_AI:'.length);
    } else if (scope === 'MC_LEGAL_ADMIN') {
      aiRole = 'admin';
    } else {
      aiRole = scope;
    }
    if (parsed.data.source && parsed.data.source.trim() && parsed.data.source.trim() !== 'ai_bot') {
      aiRole = parsed.data.source.trim();
    }
  }

  const created = await prisma.mcLegalRequest.create({
    data: {
      title: d.title,
      description: d.description,
      category: d.category,
      priority: d.priority,
      status: 'OPEN',
      requesterId: d.requesterId,
      assigneeId: d.assigneeId,
      notes: d.notes,
      vaultPath: d.vaultPath,
      createdByAi: aiRole,
    },
  });

  if (auth.kind === 'apikey') {
    await logAiActivity({
      aiRole: aiRole ?? 'unknown',
      action: 'create_mc_legal_request',
      apiKeyId: auth.ctx.apiKeyId,
      payload: {
        summary: `创建 MC 法务工单：${created.title}`,
        id: created.id,
        priority: created.priority,
        category: created.category,
        resolvedBy: resolved.resolvedBy,
      },
    });
  }

  return NextResponse.json(created, { status: 201 });
}
