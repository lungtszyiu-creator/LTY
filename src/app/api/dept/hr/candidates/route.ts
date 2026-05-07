/**
 * HR · 候选人 API
 *
 * GET  /api/dept/hr/candidates  — 列表（人 session OR HR_READONLY）
 * POST /api/dept/hr/candidates  — AI 创建候选人（HR_AI:hr_clerk / HR_ADMIN）
 *   AI 用例：扫简历 / 抓招聘平台 / 内推自动化 → 落候选人记录到漏斗 APPLIED 阶段
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireDeptAuthOrApiKey } from '@/lib/dept-access';
import { logAiActivity } from '@/lib/ai-log';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireDeptAuthOrApiKey(req, 'hr', [
    'HR_AI:hr_clerk',
    'HR_READONLY',
  ]);
  if (auth instanceof NextResponse) return auth;

  const stage = req.nextUrl.searchParams.get('stage');
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '50'), 200);
  const where: { stage?: string } = {};
  if (stage) where.stage = stage;

  const candidates = await prisma.hrCandidate.findMany({
    where,
    take: limit,
    orderBy: [{ stage: 'asc' }, { appliedAt: 'desc' }],
    include: { position: { select: { id: true, title: true } } },
  });
  return NextResponse.json({ candidates, _auth: auth.kind });
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  positionId: z.string().optional().nullable(),
  stage: z
    .enum(['APPLIED', 'SCREENING', 'INTERVIEWING', 'OFFER', 'HIRED', 'REJECTED'])
    .default('APPLIED'),
  resumeUrl: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const auth = await requireDeptAuthOrApiKey(req, 'hr', ['HR_AI:hr_clerk'], 'EDIT');
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
  const aiRole = auth.kind === 'apikey' ? auth.ctx.scope.replace('HR_AI:', '') : null;

  const created = await prisma.hrCandidate.create({
    data: {
      name: d.name,
      phone: d.phone?.trim() || null,
      email: d.email?.trim() || null,
      positionId: d.positionId?.trim() || null,
      stage: d.stage,
      resumeUrl: d.resumeUrl?.trim() || null,
      notes: d.notes?.trim() || null,
      createdById: auth.kind === 'session' ? auth.userId : null,
      createdByAi: aiRole,
    },
  });

  if (auth.kind === 'apikey') {
    await logAiActivity({
      aiRole: aiRole ?? 'unknown',
      action: 'create_hr_candidate',
      apiKeyId: auth.ctx.apiKeyId,
      payload: { id: created.id, name: created.name, stage: created.stage },
    });
  }

  return NextResponse.json(created, { status: 201 });
}
