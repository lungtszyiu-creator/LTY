/**
 * 行政部 · 固定资产 API
 *
 * GET  /api/dept/admin/assets — 列表（人 session OR ADMIN_READONLY）
 * POST /api/dept/admin/assets — AI 创建资产（ADMIN_AI:asset_clerk / ADMIN_ADMIN）
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireDeptAuthOrApiKey } from '@/lib/dept-access';
import { logAiActivity } from '@/lib/ai-log';

export const dynamic = 'force-dynamic';

async function generateAssetCode(purchasedAt: Date | null): Promise<string> {
  const d = purchasedAt ?? new Date();
  const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `FA-${yyyymm}-`;
  const last = await prisma.adminFixedAsset.findFirst({
    where: { assetCode: { startsWith: prefix } },
    orderBy: { assetCode: 'desc' },
    select: { assetCode: true },
  });
  const nextSeq = last?.assetCode
    ? parseInt(last.assetCode.slice(prefix.length), 10) + 1
    : 1;
  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

export async function GET(req: NextRequest) {
  const auth = await requireDeptAuthOrApiKey(req, 'admin', [
    'ADMIN_AI:asset_clerk',
    'ADMIN_READONLY',
  ]);
  if (auth instanceof NextResponse) return auth;

  const status = req.nextUrl.searchParams.get('status');
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '50'), 200);
  const where: { status?: string } = {};
  if (status) where.status = status;

  const assets = await prisma.adminFixedAsset.findMany({
    where,
    take: limit,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: { responsible: { select: { id: true, name: true, email: true } } },
  });
  return NextResponse.json({ assets, _auth: auth.kind });
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(['OFFICE_EQUIPMENT', 'FURNITURE', 'ELECTRONICS', 'OTHER']),
  location: z.string().max(200).optional().nullable(),
  purchasedAt: z.string().datetime().optional().nullable(),
  purchasePrice: z.number().min(0).optional().nullable(),
  currency: z.enum(['HKD', 'USD', 'CNY', 'USDT']).default('HKD'),
  status: z.enum(['IN_USE', 'IDLE', 'RETIRED', 'LOST']).default('IN_USE'),
  responsibleId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  vaultPath: z.string().max(500).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const auth = await requireDeptAuthOrApiKey(
    req,
    'admin',
    ['ADMIN_AI:asset_clerk'],
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
  const purchasedAt = d.purchasedAt ? new Date(d.purchasedAt) : null;
  const assetCode = await generateAssetCode(purchasedAt);
  const aiRole = auth.kind === 'apikey' ? auth.ctx.scope.replace('ADMIN_AI:', '') : null;

  const asset = await prisma.adminFixedAsset.create({
    data: {
      assetCode,
      name: d.name,
      category: d.category,
      location: d.location?.trim() || null,
      purchasedAt,
      purchasePrice: d.purchasePrice != null ? d.purchasePrice : null,
      currency: d.currency,
      status: d.status,
      responsibleId: d.responsibleId?.trim() || null,
      notes: d.notes?.trim() || null,
      vaultPath: d.vaultPath?.trim() || null,
      createdByAi: aiRole,
      createdById: auth.kind === 'session' ? auth.userId : null,
    },
  });

  if (auth.kind === 'apikey') {
    await logAiActivity({
      aiRole: aiRole ?? 'unknown',
      action: 'create_admin_asset',
      apiKeyId: auth.ctx.apiKeyId,
      payload: { id: asset.id, assetCode, name: asset.name, category: asset.category },
    });
  }

  return NextResponse.json(asset, { status: 201 });
}
