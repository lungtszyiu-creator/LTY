/**
 * 银行账户主数据 API
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuthOrApiKey } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, [
    'FINANCE_AI:reconciler',
    'FINANCE_AI:cfo',
    'FINANCE_READONLY',
  ]);

  const accounts = await prisma.bankAccount.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ accounts, _auth: auth.kind });
}

const createSchema = z.object({
  label: z.string().min(1).max(100),
  bankName: z.string().min(1).max(100),
  accountType: z.enum(['BASIC', 'CAPITAL', 'GENERAL', 'PAYROLL', 'FX']),
  accountNumber: z.string().min(1).max(50),
  currency: z.string().min(2).max(10),
  vaultPath: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuthOrApiKey(req, ['FINANCE_ADMIN']);
  const data = createSchema.parse(await req.json());
  const account = await prisma.bankAccount.create({ data });
  return NextResponse.json(account, { status: 201 });
}
