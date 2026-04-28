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

export async function GET(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, [
    'FINANCE_AI:chain_bookkeeper',
    'FINANCE_AI:reconciler',
    'FINANCE_AI:cfo',
    'FINANCE_READONLY',
  ]);

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
  amount: z.string(),               // 用 string 避免 JS 浮点损失，DB 存 Decimal
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
  ]);

  const body = await req.json();
  const data = createSchema.parse(body);

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

  return NextResponse.json(tx, { status: 201 });
}
