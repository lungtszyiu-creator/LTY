/**
 * 单个钱包 PATCH（仅老板可调）
 *
 * 当前只允许改 isActive / autoMonitor 两个 toggle 字段。
 * 其他字段（label / address / holderType 等）通过 vault 重新 ingest 同步，避免双源失同步。
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireFinanceEditSession } from '@/lib/finance-access';

const patchSchema = z
  .object({
    isActive: z.boolean().optional(),
    autoMonitor: z.boolean().optional(),
  })
  .refine((d) => d.isActive !== undefined || d.autoMonitor !== undefined, {
    message: 'At least one of isActive / autoMonitor must be provided.',
  });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireFinanceEditSession();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'VALIDATION_FAILED',
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      { status: 400 },
    );
  }

  const wallet = await prisma.cryptoWallet.findUnique({ where: { id } });
  if (!wallet) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const updated = await prisma.cryptoWallet.update({
    where: { id },
    data: parsed.data,
    select: { id: true, label: true, isActive: true, autoMonitor: true },
  });

  return NextResponse.json(updated);
}
