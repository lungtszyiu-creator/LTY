/**
 * 财务审批后置 hook（A1 phase, 2026-05-06）
 *
 * 触发：ApprovalInstance.status 变 APPROVED 或 REJECTED 时，由 action route 调用。
 * 仅作用于 template.slug='finance-large-payment'（CFO Agent 提交的财务审批）。
 *
 * 关键设计：审批通过 ≠ 自动记账。
 *  - APPROVED：写 aiPaymentStatus=WAITING_PAYMENT + 发 TG 通知"已批，等老板付款发哈希"
 *  - REJECTED：仅发 TG 通知（aiPaymentStatus 保持 null）
 *  - 真正落账由后续 attach-payment-proof endpoint 在收到付款凭证时触发
 *
 * TG 通知通过 finance_bridge 出站通道（POST /webhook/finance, role=CFO 走 fallback @LTY01_bot）。
 * Bridge 返回的 tg_message_id 写回 instance.tgAckMessageId，用于老板 reply"批"/"驳"或付款凭证 reply 反查。
 */
import { prisma } from './db';

const TEMPLATE_SLUG = 'finance-large-payment';

export async function applyFinanceHook(instanceId: string): Promise<void> {
  const inst = await prisma.approvalInstance.findUnique({
    where: { id: instanceId },
    select: {
      id: true,
      status: true,
      title: true,
      formJson: true,
      aiPaymentStatus: true,
      template: { select: { slug: true, name: true } },
    },
  });
  if (!inst) return;
  if (inst.template.slug !== TEMPLATE_SLUG) return;
  if (inst.status !== 'APPROVED' && inst.status !== 'REJECTED') return;

  let form: Record<string, unknown> = {};
  try {
    form = JSON.parse(inst.formJson || '{}');
  } catch {
    form = {};
  }

  if (inst.status === 'APPROVED') {
    // 幂等：如果已经写过 WAITING_PAYMENT/POSTED 就别重复发通知
    if (inst.aiPaymentStatus) return;

    await prisma.approvalInstance.update({
      where: { id: instanceId },
      data: { aiPaymentStatus: 'WAITING_PAYMENT' },
    });

    const amount = String(form.amount ?? '?');
    const currency = String(form.currency ?? '');
    const summary = String(form.summary ?? inst.title);
    const type = String(form.type ?? 'PAYMENT');

    const content = [
      `✅ <b>报销已批准</b> · ${escapeHtml(type)}`,
      `<i>${escapeHtml(inst.title)}</i>`,
      `金额：<b>${escapeHtml(amount)} ${escapeHtml(currency)}</b>`,
      ``,
      `📋 摘要：${escapeHtml(summary).slice(0, 200)}`,
      ``,
      `🔔 <b>等待老板付款</b>`,
      `请老板转账完成后，<b>reply 本消息</b>并附链上 hash。`,
      `链上记账员将自动验证金额、收款人后落账。`,
      ``,
      `<i>审批 ID：<code>${inst.id}</code></i>`,
    ].join('\n');

    const tgMsgId = await sendCfoNotice(content);
    if (tgMsgId != null) {
      await prisma.approvalInstance.update({
        where: { id: instanceId },
        data: { tgAckMessageId: tgMsgId },
      });
    }
    return;
  }

  // REJECTED
  const content = [
    `❌ <b>报销已驳回</b>`,
    `<i>${escapeHtml(inst.title)}</i>`,
    ``,
    `<i>审批 ID：<code>${inst.id}</code></i>`,
  ].join('\n');
  await sendCfoNotice(content);
}

async function sendCfoNotice(content: string): Promise<number | null> {
  const baseUrl = process.env.FINANCE_BRIDGE_URL;
  const bridgeKey = process.env.FINANCE_BRIDGE_KEY;
  if (!baseUrl || !bridgeKey) {
    console.warn('[finance-hook] FINANCE_BRIDGE_URL/KEY 未配置，跳过 TG 通知');
    return null;
  }
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/webhook/finance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Key': bridgeKey,
      },
      body: JSON.stringify({ role: 'CFO', content }),
    });
    if (!res.ok) {
      console.error('[finance-hook] bridge POST failed', res.status, await res.text().catch(() => ''));
      return null;
    }
    const j = (await res.json()) as { tg_message_id?: number };
    return typeof j.tg_message_id === 'number' ? j.tg_message_id : null;
  } catch (e) {
    console.error('[finance-hook] bridge POST error', e);
    return null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
