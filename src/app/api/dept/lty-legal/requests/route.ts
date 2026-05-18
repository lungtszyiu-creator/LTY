/**
 * LTY 法务部 · 需求工单 API
 *
 * GET  /api/dept/lty-legal/requests — 列表（人 session OR LTY_LEGAL_READONLY）
 * POST /api/dept/lty-legal/requests — AI 创建工单
 *
 * 5/19 PR C：body 接受 Maggie V5 spec alias（type/submitter/assignee/priority
 * 小写值/department/source/ai_triage_reasoning），扩 POST scope 允许 ADMIN +
 * assistant key 调（Maggie 用 LTY_LEGAL_ADMIN 挂 8 个 workflow）。详见
 * lib/legal-request-input.ts。
 *
 * 与 mc-legal/requests 物理隔离 —— 操作 LtyLegalRequest 不操作 McLegalRequest。
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
  'LTY_LEGAL_AI:legal_clerk',
  'LTY_LEGAL_AI:assistant',
  'LTY_LEGAL_ADMIN',
];

export async function GET(req: NextRequest) {
  const auth = await requireDeptAuthOrApiKey(req, 'lty-legal', [
    'LTY_LEGAL_AI:legal_clerk',
    'LTY_LEGAL_AI:assistant',
    'LTY_LEGAL_READONLY',
    'LTY_LEGAL_ADMIN',
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

export async function POST(req: NextRequest) {
  const auth = await requireDeptAuthOrApiKey(req, 'lty-legal', POST_ALLOWED_SCOPES, 'EDIT');
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
    expectedDeptSlug: 'lty-legal',
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

  // aiRole：apikey 路径标识；scope=LTY_LEGAL_ADMIN 时无 ":role" 后缀，用 'admin'
  let aiRole: string | null = null;
  if (auth.kind === 'apikey') {
    const scope = auth.ctx.scope;
    if (scope.startsWith('LTY_LEGAL_AI:')) {
      aiRole = scope.slice('LTY_LEGAL_AI:'.length);
    } else if (scope === 'LTY_LEGAL_ADMIN') {
      aiRole = 'admin';
    } else {
      aiRole = scope;
    }
    // 显式 source 字段如 Maggie V5 写 "ai_bot" 不影响（仅记录用，覆盖时改 aiRole）
    if (parsed.data.source && parsed.data.source.trim() && parsed.data.source.trim() !== 'ai_bot') {
      aiRole = parsed.data.source.trim();
    }
  }

  const created = await prisma.ltyLegalRequest.create({
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
      action: 'create_lty_legal_request',
      apiKeyId: auth.ctx.apiKeyId,
      payload: {
        summary: `创建 LTY 法务工单：${created.title}`,
        id: created.id,
        priority: created.priority,
        category: created.category,
        resolvedBy: resolved.resolvedBy,
      },
    });
  }

  return NextResponse.json(created, { status: 201 });
}
