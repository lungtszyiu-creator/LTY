/**
 * 钱包主数据 API
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuthOrApiKey } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, [
    'FINANCE_AI:chain_bookkeeper',
    'FINANCE_AI:reconciler',
    'FINANCE_AI:cfo',
    'FINANCE_READONLY',
  ]);

  const wallets = await prisma.cryptoWallet.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
    include: {
      holderUser: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ wallets, _auth: auth.kind });
}

const createSchema = z.object({
  label: z.string().min(1).max(100),
  chain: z.string().min(1).max(20),
  address: z.string().min(10),
  holderType: z.enum(['BOSS', 'COMPANY_CASHIER', 'EMPLOYEE', 'TREASURY', 'EXTERNAL']),
  holderUserId: z.string().optional().nullable(),
  purpose: z.string().optional().nullable(),
  vaultPath: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  // 创建钱包仅老板（ADMIN scope）
  const auth = await requireAuthOrApiKey(req, ['FINANCE_ADMIN']);
  const data = createSchema.parse(await req.json());

  const wallet = await prisma.cryptoWallet.create({ data });
  return NextResponse.json(wallet, { status: 201 });
}
