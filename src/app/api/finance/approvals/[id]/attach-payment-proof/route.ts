/**
 * 付款凭证上链验证 + 自动落账（A1，2026-05-06）
 *
 * POST /api/finance/approvals/[id]/attach-payment-proof
 *
 * 用途：链上记账员 AI 收到老板/出纳 reply 审批 ack 消息附带的链上 hash 时调本端点。
 * 端点替 AI 做以下事：
 *   1) Etherscan 拉 sender 地址近期 token transfer，确认 txHash 真实存在
 *   2) 严格校验链上 token transfer 的 amount / token symbol == form.amount / form.currency
 *   3) 通过 → prisma.voucher.create（关联到 approvalInstance.id），状态 AI_DRAFT
 *   4) 更新 ApprovalInstance.paymentProofs（append）+ aiPaymentStatus='POSTED'
 *
 * 信任边界：
 *  - AI 提供凭证科目（debitAccount/creditAccount）—— 由链上记账员的 prompt 决定，
 *    后端不替 AI 判断科目对错（这是 AI 的本职）
 *  - 不传科目时 lib 用 A1 默认值（借: 管理费用-办公费, 贷: 其他货币资金-{USDC/USDT}钱包）
 *  - 后端做的是「链上数据真伪 + 金额严格匹配」的把关，不让 AI 编造哈希或绕过金额
 *
 * 严格 0 差异：链上 USDC/USDT 是精确 6 位小数 transfer，老板钱包 UI 输多少转多少，
 *  不存在"凑整"问题。任何金额不等都拒收 → 标 needs_review，老板手动复核。
 *
 * 鉴权：FINANCE_AI:chain_bookkeeper（链上记账员专属 scope）
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuthOrApiKey } from '@/lib/api-auth';
import { logAiActivity } from '@/lib/ai-log';
import { verifyAndPostChainPayment } from '@/lib/financePaymentVerifier';

const schema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'txHash must be 0x + 64 hex chars'),
  chain: z.literal('ethereum'),
  senderAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'senderAddress must be 0x + 40 hex chars'),
  // AI 决定的凭证科目（链上记账员 prompt 里有规则）—— 全部可选，不传时 lib 用 A1 默认值
  voucherDate: z.string().datetime().optional().nullable(),
  summary: z.string().min(1).max(500).optional().nullable(),
  debitAccount: z.string().min(1).max(100).optional().nullable(),
  creditAccount: z.string().min(1).max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  vaultPath: z.string().optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuthOrApiKey(req, ['FINANCE_AI:chain_bookkeeper'], 'EDIT');
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'VALIDATION_FAILED',
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const inst = await prisma.approvalInstance.findUnique({
    where: { id: params.id },
    include: { template: { select: { slug: true, name: true } } },
  });
  if (!inst) return NextResponse.json({ error: 'INSTANCE_NOT_FOUND' }, { status: 404 });
  if (inst.template.slug !== 'finance-large-payment') {
    return NextResponse.json({ error: 'NOT_FINANCE_TEMPLATE', got: inst.template.slug }, { status: 400 });
  }
  if (inst.status !== 'APPROVED') {
    return NextResponse.json({ error: 'INSTANCE_NOT_APPROVED', currentStatus: inst.status }, { status: 409 });
  }
  if (inst.aiPaymentStatus !== 'WAITING_PAYMENT') {
    return NextResponse.json(
      {
        error: 'NOT_WAITING_PAYMENT',
        currentAiPaymentStatus: inst.aiPaymentStatus,
        message:
          inst.aiPaymentStatus === 'POSTED'
            ? 'This approval has already been posted; cannot attach again.'
            : 'aiPaymentStatus is null — finance hook never fired. Investigate.',
      },
      { status: 409 },
    );
  }

  const result = await verifyAndPostChainPayment(inst, {
    txHash: data.txHash,
    senderAddress: data.senderAddress,
    voucherDate: data.voucherDate ?? undefined,
    summary: data.summary ?? undefined,
    debitAccount: data.debitAccount ?? undefined,
    creditAccount: data.creditAccount ?? undefined,
    notes: data.notes ?? undefined,
    vaultPath: data.vaultPath ?? undefined,
    createdByAi: auth.kind === 'apikey' ? auth.ctx.scope.split(':')[1] || undefined : undefined,
    createdById: auth.kind === 'session' ? auth.userId : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ ...result }, { status: result.status });
  }

  if (auth.kind === 'apikey') {
    await logAiActivity({
      aiRole: auth.ctx.scope.split(':')[1] ?? 'unknown',
      action: 'attach_payment_proof',
      apiKeyId: auth.ctx.apiKeyId,
      voucherId: result.voucher.id,
      payload: {
        approvalInstanceId: inst.id,
        txHash: result.txHash,
      },
      vaultWritten: !!data.vaultPath,
    });
  }

  return NextResponse.json(result, { status: 201 });
}
