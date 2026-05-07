/**
 * 行政部 · 证照 API
 *
 * GET  /api/dept/admin/licenses  — 列表（人 session OR ADMIN_READONLY scope）
 * POST /api/dept/admin/licenses  — AI 创建证照（ADMIN_AI:license_clerk / ADMIN_ADMIN）
 *
 * 让 Coze 行政证照管家 plugin 能直接写。状态自动派生，到期监控不依赖 AI。
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireDeptAuthOrApiKey } from '@/lib/dept-access';
import { logAiActivity } from '@/lib/ai-log';

export const dynamic = 'force-dynamic';

function deriveStatus(expireAt: Date | null): 'ACTIVE' | 'EXPIRING' | 'EXPIRED' {
  if (!expireAt) return 'ACTIVE';
  const t = expireAt.getTime();
  const now = Date.now();
  if (t < now) return 'EXPIRED';
  if (t - now < 30 * 24 * 60 * 60 * 1000) return 'EXPIRING';
  return 'ACTIVE';
}

export async function GET(req: NextRequest) {
  const auth = await requireDeptAuthOrApiKey(req, 'admin', [
    'ADMIN_AI:license_clerk',
    'ADMIN_READONLY',
  ]);
  if (auth instanceof NextResponse) return auth;

  const status = req.nextUrl.searchParams.get('status');
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '50'), 200);
  const where: { status?: string } = {};
  if (status) where.status = status;

  const licenses = await prisma.adminLicense.findMany({
    where,
    take: limit,
    orderBy: [{ status: 'asc' }, { expireAt: 'asc' }, { createdAt: 'desc' }],
    include: { responsible: { select: { id: true, name: true, email: true } } },
  });
  return NextResponse.json({ licenses, _auth: auth.kind });
}

const createSchema = z.object({
  type: z.enum(['BUSINESS_LICENSE', 'CONTRACT', 'QUALIFICATION', 'CERTIFICATE', 'OTHER']),
  name: z.string().min(1).max(200),
  identifier: z.string().max(200).optional().nullable(),
  issuedAt: z.string().datetime().optional().nullable(),
  expireAt: z.string().datetime().optional().nullable(),
  responsibleId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  vaultPath: z.string().max(500).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const auth = await requireDeptAuthOrApiKey(
    req,
    'admin',
    ['ADMIN_AI:license_clerk'],
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
  const expireAt = d.expireAt ? new Date(d.expireAt) : null;
  const aiRole = auth.kind === 'apikey' ? auth.ctx.scope.replace('ADMIN_AI:', '') : null;

  const license = await prisma.adminLicense.create({
    data: {
      type: d.type,
      name: d.name,
      identifier: d.identifier?.trim() || null,
      issuedAt: d.issuedAt ? new Date(d.issuedAt) : null,
      expireAt,
      status: deriveStatus(expireAt),
      responsibleId: d.responsibleId?.trim() || null,
      notes: d.notes?.trim() || null,
      vaultPath: d.vaultPath?.trim() || null,
      createdByAi: aiRole,
      createdById: auth.kind === 'session' ? auth.userId : null,
    },
  });

  // AI 活动审计
  if (auth.kind === 'apikey') {
    await logAiActivity({
      aiRole: aiRole ?? 'unknown',
      action: 'create_admin_license',
      apiKeyId: auth.ctx.apiKeyId,
      payload: { id: license.id, type: license.type, name: license.name },
    });
  }

  return NextResponse.json(license, { status: 201 });
}
