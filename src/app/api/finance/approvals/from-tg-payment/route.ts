/**
 * 反向付款落账（A1，2026-05-06）
 *
 * POST /api/finance/approvals/from-tg-payment
 *
 * 用途：bridge 在老板/出纳 reply 审批 ack 消息附 hash 时调本端点。
 *  bridge 替老板做的是「按 ackMessageId 反查 instance + 调 verifyAndPostChainPayment」，
 *  科目走 lib 的 A1 默认值（借:管理费用-办公费 / 贷:其他货币资金-{USDC|USDT}钱包），
 *  老板看到凭证 status=AI_DRAFT 后可手动改科目（凭证编辑 UI 已有）。
 *
 * 鉴权：X-Bridge-Key（与 5 AI 出站通道共用同一把密钥）。bridge 上层已经做了
 *  sender ∈ allowed_user_ids + chat ∈ allowed_chat_ids，本端点只验密钥。
 *
 * 与 attach-payment-proof endpoint 的区别：
 *  - attach-payment-proof: 链上记账员 AI 调（FINANCE_AI:chain_bookkeeper），可传科目
 *  - from-tg-payment:      bridge 直调（X-Bridge-Key），用 ackMessageId 反查 + 默认科目
 *  两者共用 lib `verifyAndPostChainPayment`，结果（voucher/proofs/状态）一致。
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { verifyAndPostChainPayment } from '@/lib/financePaymentVerifier';

const schema = z.object({
  tgAckMessageId: z.number().int().positive(),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'txHash must be 0x + 64 hex chars'),
  senderAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'senderAddress must be 0x + 40 hex chars'),
  notes: z.string().max(1000).optional().nullable(),
  // 元信息（仅审计用，不参与决策）：bridge 把发 reply 的 TG user_id 透传过来
  fromTgUserId: z.number().int().positive().optional(),
});

export async function POST(req: NextRequest) {
  const got = req.headers.get('x-bridge-key') ?? '';
  const expected = process.env.FINANCE_BRIDGE_KEY ?? '';
  if (!expected) {
    return NextResponse.json({ error: 'BRIDGE_KEY_NOT_CONFIGURED' }, { status: 500 });
  }
  if (got !== expected) {
    return NextResponse.json({ error: 'BAD_BRIDGE_KEY' }, { status: 401 });
  }

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

  // 1) 反查 instance by tgAckMessageId
  const inst = await prisma.approvalInstance.findFirst({
    where: { tgAckMessageId: data.tgAckMessageId },
    include: { template: { select: { slug: true, name: true } } },
  });
  if (!inst) {
    return NextResponse.json(
      { error: 'INSTANCE_NOT_FOUND_BY_ACK', tgAckMessageId: data.tgAckMessageId },
      { status: 404 },
    );
  }
  if (inst.template.slug !== 'finance-large-payment') {
    return NextResponse.json({ error: 'NOT_FINANCE_TEMPLATE', got: inst.template.slug }, { status: 400 });
  }
  if (inst.status !== 'APPROVED') {
    return NextResponse.json(
      { error: 'INSTANCE_NOT_APPROVED', currentStatus: inst.status, instanceId: inst.id },
      { status: 409 },
    );
  }
  if (inst.aiPaymentStatus !== 'WAITING_PAYMENT') {
    return NextResponse.json(
      {
        error: 'NOT_WAITING_PAYMENT',
        currentAiPaymentStatus: inst.aiPaymentStatus,
        instanceId: inst.id,
        message:
          inst.aiPaymentStatus === 'POSTED'
            ? '该审批已落账，重复 reply hash 会被拒。'
            : 'aiPaymentStatus is null — finance hook 未触发，去查 approvalFinanceHook 日志。',
      },
      { status: 409 },
    );
  }

  // 2) 调 lib 验证 + 落账（A1 默认科目）
  const result = await verifyAndPostChainPayment(inst, {
    txHash: data.txHash,
    senderAddress: data.senderAddress,
    notes: data.notes ?? undefined,
    createdByAi: 'bridge_auto', // 标记是 bridge 自动落账，不是真 AI 调用
  });

  if (!result.ok) {
    return NextResponse.json({ ...result }, { status: result.status });
  }

  return NextResponse.json(
    {
      ...result,
      instanceId: inst.id,
      instanceTitle: inst.title,
    },
    { status: 201 },
  );
}
