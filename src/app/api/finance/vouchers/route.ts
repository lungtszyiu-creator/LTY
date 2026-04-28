/**
 * 凭证 API
 *
 * GET  /api/finance/vouchers       — 列表（人类登录或财务只读 key）
 * POST /api/finance/vouchers       — 创建草稿（凭证编制员 AI 或 ADMIN）
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuthOrApiKey } from '@/lib/api-auth';
import { logAiActivity } from '@/lib/ai-log';

// ---- GET：列表 ----
export async function GET(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, [
    'FINANCE_AI:voucher_clerk',
    'FINANCE_AI:cfo',
    'FINANCE_READONLY',
  ]);

  const status = req.nextUrl.searchParams.get('status'); // AI_DRAFT / POSTED / ...
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? '50');

  const where: any = {};
  if (status) where.status = status;

  const vouchers = await prisma.voucher.findMany({
    where,
    take: Math.min(limit, 200),
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      postedBy: { select: { id: true, name: true, email: true } },
      approvalInstance: { select: { id: true, status: true } },
    },
  });

  return NextResponse.json({ vouchers, _auth: auth.kind });
}

// ---- POST：创建草稿 ----
const createSchema = z.object({
  date: z.string().datetime(),
  summary: z.string().min(1).max(500),
  debitAccount: z.string().min(1).max(100),
  creditAccount: z.string().min(1).max(100),
  amount: z.number().positive(),
  currency: z.string().min(1).max(10),
  notes: z.string().max(1000).optional().nullable(),
  vaultPath: z.string().optional().nullable(),
  relatedTxIds: z.array(z.string()).optional(),
  attachmentIds: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, [
    'FINANCE_AI:voucher_clerk',
    'FINANCE_AI:cfo',
  ]);

  const body = await req.json();
  const data = createSchema.parse(body);

  const voucher = await prisma.voucher.create({
    data: {
      date: new Date(data.date),
      summary: data.summary,
      debitAccount: data.debitAccount,
      creditAccount: data.creditAccount,
      amount: data.amount,
      currency: data.currency,
      notes: data.notes ?? null,
      vaultPath: data.vaultPath ?? null,
      relatedTxIds: data.relatedTxIds ? JSON.stringify(data.relatedTxIds) : null,
      attachmentIds: data.attachmentIds ? JSON.stringify(data.attachmentIds) : null,
      status: 'AI_DRAFT',
      createdByAi: auth.kind === 'apikey' ? auth.ctx.scope.split(':')[1] || null : null,
      createdById: auth.kind === 'session' ? auth.userId : null,
    },
  });

  // 写 AI 活动日志（仅 AI 调用时）
  if (auth.kind === 'apikey') {
    await logAiActivity({
      aiRole: auth.ctx.scope.split(':')[1] ?? 'unknown',
      action: 'create_voucher',
      apiKeyId: auth.ctx.apiKeyId,
      voucherId: voucher.id,
      payload: { summary: data.summary, amount: data.amount, currency: data.currency },
      vaultWritten: !!data.vaultPath,
    });
  }

  return NextResponse.json(voucher, { status: 201 });
}
