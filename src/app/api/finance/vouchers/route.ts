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
import { writeVoucherAudit } from '@/lib/voucher-audit';

// ---- GET：列表 ----
export async function GET(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, [
    'FINANCE_AI:voucher_clerk',
    'FINANCE_AI:reconciler', // 对账员要能读 vouchers 做账面对账
    'FINANCE_AI:cfo',
    'FINANCE_READONLY',
  ]);
  if (auth instanceof NextResponse) return auth;

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
// 注意：所有 number 字段用 z.coerce.number()，因为 Coze plugin 默认把所有参数
// 当字符串发（即使在 tool spec 里声明为 Number 类型也偶尔不准）。coerce 让我们
// 同时接受 0.01 和 "0.01"，对外部调用方更宽容。
const createSchema = z.object({
  date: z.string().datetime(),
  summary: z.string().min(1).max(500),
  debitAccount: z.string().min(1).max(100),
  creditAccount: z.string().min(1).max(100),
  amount: z.coerce.number().positive(),
  currency: z.string().min(1).max(10),
  notes: z.string().max(1000).optional().nullable(),
  vaultPath: z.string().optional().nullable(),
  relatedTxIds: z.array(z.string()).optional(),
  attachmentIds: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  // 创建凭证：AI（voucher_clerk / cfo）+ EDITOR（老板）+ VIEWER（出纳） 都能用。
  // 出纳手动建凭证用于补救 AI 失效场景（OCR plugin 跑挂、bridge 超时等）。
  // 所有创建都写 audit log，老板能在凭证详情页看到来源。
  const auth = await requireAuthOrApiKey(req, [
    'FINANCE_AI:voucher_clerk',
    'FINANCE_AI:cfo',
  ], 'VIEW');
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

  // 写 voucher audit log（任何创建都留痕，老板能看谁建的）
  await writeVoucherAudit({
    voucherId: voucher.id,
    action: 'create',
    before: null,
    after: {
      summary: voucher.summary,
      debitAccount: voucher.debitAccount,
      creditAccount: voucher.creditAccount,
      amount: voucher.amount.toString(),
      currency: voucher.currency,
      status: voucher.status,
    },
    changedById: auth.kind === 'session' ? auth.userId : null,
    byAi: auth.kind === 'apikey' ? auth.ctx.scope.split(':')[1] ?? null : null,
  });

  return NextResponse.json(voucher, { status: 201 });
}
