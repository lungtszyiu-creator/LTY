/**
 * 反向审批通道（A1，2026-05-06）
 *
 * 用途：finance_bridge 在老板 TG reply"批"/"驳"审批 ack 消息时调本端点，
 * 替老板把审批 instance 推进到 APPROVED/REJECTED。
 *
 * 鉴权：X-Bridge-Key（与 5 AI 出站通道共用同一把密钥，env 名 FINANCE_BRIDGE_KEY）
 *  - 信任边界 = bridge 持有该 key。bridge 已经做了 sender ∈ allowed_user_ids
 *    + chat ∈ allowed_chat_ids 的校验，所以本端点不再校验老板 TG ID，只验 BRIDGE_KEY。
 *
 * actor 解析：通过 tgAckMessageId 反查 instance → 找其 pending APPROVAL step →
 *  step.approverId 即老板的 User.id（applyDecision 会校验 NOT_YOUR_STEP）。
 *
 * 副作用：与 web 端 /api/approvals/[id]/action 一致 —— 推进 step + 触发
 *  applyBalanceEffects（finance 模板无副作用）+ applyFinanceHook（写 WAITING_PAYMENT
 *  + 发"已批"二次 TG 通知）+ notifyApprovalFinalised（email）。
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { applyDecision } from '@/lib/approvalRuntime';
import { applyBalanceEffects } from '@/lib/approvalTerminal';
import { applyFinanceHook } from '@/lib/approvalFinanceHook';
import { notifyApprovalFinalised } from '@/lib/email';

const schema = z.object({
  tgAckMessageId: z.number().int().positive(),
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().max(2000).optional().nullable(),
  // 元信息（仅供审计 log，不参与决策）：bridge 把发 reply 的 TG user_id 透传过来
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

  let parsed;
  try {
    parsed = schema.parse(await req.json());
  } catch (e: any) {
    return NextResponse.json({ error: 'VALIDATION_FAILED', detail: e?.message }, { status: 400 });
  }

  // 1) 通过 ack message id 反查 instance（迁移加了 unique-ish index）
  const inst = await prisma.approvalInstance.findFirst({
    where: { tgAckMessageId: parsed.tgAckMessageId },
    include: {
      template: { select: { name: true, slug: true } },
      initiator: { select: { email: true, name: true } },
      steps: {
        where: { kind: 'APPROVAL', decision: null, superseded: false },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!inst) {
    return NextResponse.json(
      { error: 'INSTANCE_NOT_FOUND', tgAckMessageId: parsed.tgAckMessageId },
      { status: 404 },
    );
  }
  if (inst.status !== 'IN_PROGRESS') {
    return NextResponse.json(
      { error: 'INSTANCE_FINALISED', currentStatus: inst.status, instanceId: inst.id },
      { status: 409 },
    );
  }
  if (inst.steps.length === 0) {
    return NextResponse.json(
      { error: 'NO_PENDING_APPROVAL_STEP', instanceId: inst.id },
      { status: 409 },
    );
  }

  // 2) finance 模板只有一步老板审批，取第一个 pending 即可
  const step = inst.steps[0];
  if (!step.approverId) {
    return NextResponse.json(
      { error: 'STEP_HAS_NO_APPROVER', stepId: step.id },
      { status: 500 },
    );
  }

  // 3) 推进决定（applyDecision 内部会校验 step.approverId === actorId，
  //    我们用 step.approverId 当 actor 是合法的 — 老板是这一步的 approver）
  let result;
  try {
    result = await applyDecision(inst.id, step.id, parsed.decision, step.approverId, parsed.note ?? null);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'DECISION_FAILED', instanceId: inst.id },
      { status: 400 },
    );
  }

  // 4) 与 web 端 action route 一致的下游副作用（fire-and-forget）
  if (result.status === 'APPROVED') {
    applyBalanceEffects(inst.id).catch((e) =>
      console.error('[finance/from-tg-reply] balance effects failed', e),
    );
  }
  if (result.status === 'APPROVED' || result.status === 'REJECTED') {
    applyFinanceHook(inst.id).catch((e) =>
      console.error('[finance/from-tg-reply] finance hook failed', e),
    );
    notifyApprovalFinalised({
      initiatorEmail: inst.initiator.email ?? '',
      initiatorName: inst.initiator.name ?? inst.initiator.email ?? '',
      instanceId: inst.id,
      instanceTitle: inst.title,
      templateName: inst.template.name,
      outcome: result.status as 'APPROVED' | 'REJECTED',
      lastActorName: `老板 (TG reply${parsed.fromTgUserId ? ` from ${parsed.fromTgUserId}` : ''})`,
      lastNote: parsed.note ?? null,
    }).catch((e) => console.error('[finance/from-tg-reply] notify finalised failed', e));
  }

  return NextResponse.json({
    ok: true,
    instanceId: inst.id,
    status: result.status,
    currentNodeId: result.currentNodeId,
  });
}
