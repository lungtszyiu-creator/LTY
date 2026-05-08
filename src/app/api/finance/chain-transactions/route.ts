/**
 * 链上交易 API
 *
 * GET  /api/finance/chain-transactions  — 列表（财务可读）
 * POST /api/finance/chain-transactions  — AI 写一条新交易
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuthOrApiKey } from '@/lib/api-auth';
import { logAiActivity } from '@/lib/ai-log';
import { archiveChainTransaction, fireAndForgetArchive } from '@/lib/finance-vault-sync';

export async function GET(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, [
    'FINANCE_AI:chain_bookkeeper',
    'FINANCE_AI:reconciler',
    'FINANCE_AI:cfo',
    'FINANCE_READONLY',
  ]);
  if (auth instanceof NextResponse) return auth;

  const tag = req.nextUrl.searchParams.get('tag');
  const isReconciled = req.nextUrl.searchParams.get('reconciled');
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? '50');

  const where: any = {};
  if (tag) where.tag = tag;
  if (isReconciled !== null) where.isReconciled = isReconciled === 'true';

  const txs = await prisma.chainTransaction.findMany({
    where,
    take: Math.min(limit, 500),
    orderBy: { timestamp: 'desc' },
    include: {
      fromWallet: { select: { id: true, label: true, address: true } },
      toWallet: { select: { id: true, label: true, address: true } },
    },
  });

  return NextResponse.json({ transactions: txs, _auth: auth.kind });
}

const createSchema = z.object({
  chain: z.string().min(1).max(20),
  txHash: z.string().min(1),
  timestamp: z.string().datetime(),
  fromAddress: z.string().min(1),
  toAddress: z.string().min(1),
  // amount 用 coerce 接受 number 或 string；最终再 toString 进 Decimal 避免精度损失
  amount: z.coerce.string(),
  token: z.string().min(1).max(20),
  tokenContract: z.string().optional().nullable(),
  tag: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  vaultPath: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, [
    'FINANCE_AI:chain_bookkeeper',
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

  // 自动匹配已注册的钱包（fromAddress / toAddress）
  const [fromWallet, toWallet] = await Promise.all([
    prisma.cryptoWallet.findFirst({ where: { chain: data.chain, address: data.fromAddress } }),
    prisma.cryptoWallet.findFirst({ where: { chain: data.chain, address: data.toAddress } }),
  ]);

  const tx = await prisma.chainTransaction.create({
    data: {
      chain: data.chain,
      txHash: data.txHash,
      timestamp: new Date(data.timestamp),
      fromAddress: data.fromAddress,
      toAddress: data.toAddress,
      fromWalletId: fromWallet?.id,
      toWalletId: toWallet?.id,
      amount: data.amount,
      token: data.token,
      tokenContract: data.tokenContract ?? null,
      tag: data.tag ?? null,
      notes: data.notes ?? null,
      vaultPath: data.vaultPath ?? null,
      createdByAi: auth.kind === 'apikey' ? auth.ctx.scope.split(':')[1] || null : null,
    },
  });

  if (auth.kind === 'apikey') {
    await logAiActivity({
      aiRole: auth.ctx.scope.split(':')[1] ?? 'unknown',
      action: 'log_chain_tx',
      apiKeyId: auth.ctx.apiKeyId,
      chainTransactionId: tx.id,
      payload: { txHash: data.txHash, amount: data.amount, token: data.token, tag: data.tag },
      vaultWritten: !!data.vaultPath,
    });
  }

  // 链上数据本身是事实，创建即归档（dry-run 默认）
  if (!tx.vaultPath) {
    fireAndForgetArchive(archiveChainTransaction, tx, `chain_tx ${tx.chain}-${tx.txHash.slice(0, 10)}`);
  }

  return NextResponse.json(tx, { status: 201 });
}
