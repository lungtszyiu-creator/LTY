/**
 * 三方对账 API
 *
 * GET  /api/finance/reconciliations  — 列表
 * POST /api/finance/reconciliations  — 对账员 AI 上报对账结果（upsert by period+scope）
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuthOrApiKey } from '@/lib/api-auth';
import { logAiActivity } from '@/lib/ai-log';
import { archiveReconciliation, fireAndForgetArchive } from '@/lib/finance-vault-sync';

export async function GET(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, [
    'FINANCE_AI:reconciler',
    'FINANCE_AI:cfo',
    'FINANCE_READONLY',
  ]);
  if (auth instanceof NextResponse) return auth;

  const period = req.nextUrl.searchParams.get('period');
  const status = req.nextUrl.searchParams.get('status');
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? '50');

  const where: any = {};
  if (period) where.period = period;
  if (status) where.status = status;

  const recons = await prisma.reconciliation.findMany({
    where,
    take: Math.min(limit, 200),
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ reconciliations: recons, _auth: auth.kind });
}

const createSchema = z.object({
  period: z.string().min(1).max(20),                           // "2026-04"
  scope: z.enum(['MONTHLY', 'WEEKLY', 'ADHOC']),
  bankTotal: z.coerce.string().optional().nullable(),
  chainTotal: z.coerce.string().optional().nullable(),
  ledgerTotal: z.coerce.string().optional().nullable(),
  diffAmount: z.coerce.string().optional().nullable(),
  diffCurrency: z.string().max(10).optional().nullable(),
  status: z.enum(['OPEN', 'RESOLVED', 'ESCALATED']).optional(),
  resolutionNote: z.string().max(2000).optional().nullable(),
  vaultPath: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, [
    'FINANCE_AI:reconciler',
    'FINANCE_AI:cfo',
  ], 'EDIT');
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parseResult = createSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: 'VALIDATION_FAILED',
        issues: parseResult.error.issues.map((i) => ({ path: i.path, message: i.message })),
        received: body,
      },
      { status: 400 },
    );
  }
  const data = parseResult.data;

  const isResolved = data.status === 'RESOLVED' || data.status === 'ESCALATED';

  const recon = await prisma.reconciliation.upsert({
    where: { period_scope: { period: data.period, scope: data.scope } },
    create: {
      period: data.period,
      scope: data.scope,
      bankTotal: data.bankTotal ?? null,
      chainTotal: data.chainTotal ?? null,
      ledgerTotal: data.ledgerTotal ?? null,
      diffAmount: data.diffAmount ?? null,
      diffCurrency: data.diffCurrency ?? null,
      status: data.status ?? 'OPEN',
      resolutionNote: data.resolutionNote ?? null,
      vaultPath: data.vaultPath ?? null,
      createdByAi: auth.kind === 'apikey' ? auth.ctx.scope.split(':')[1] || null : null,
      closedAt: isResolved ? new Date() : null,
    },
    update: {
      bankTotal: data.bankTotal ?? undefined,
      chainTotal: data.chainTotal ?? undefined,
      ledgerTotal: data.ledgerTotal ?? undefined,
      diffAmount: data.diffAmount ?? undefined,
      diffCurrency: data.diffCurrency ?? undefined,
      status: data.status ?? undefined,
      resolutionNote: data.resolutionNote ?? undefined,
      vaultPath: data.vaultPath ?? undefined,
      closedAt: isResolved ? new Date() : undefined,
    },
  });

  if (auth.kind === 'apikey') {
    await logAiActivity({
      aiRole: auth.ctx.scope.split(':')[1] ?? 'unknown',
      action: 'upsert_reconciliation',
      apiKeyId: auth.ctx.apiKeyId,
      reconciliationId: recon.id,
      payload: {
        period: data.period,
        scope: data.scope,
        status: data.status,
        diffAmount: data.diffAmount,
      },
      vaultWritten: !!data.vaultPath,
    });
  }

  // 对账状态 RESOLVED / ESCALATED 时归档（终态 · dry-run 默认）
  if (isResolved && !recon.vaultPath) {
    fireAndForgetArchive(archiveReconciliation, recon, `reconciliation ${recon.period} ${recon.scope}`);
  }

  return NextResponse.json(recon, { status: 201 });
}
