/**
 * 给老板推 Telegram 通知的通用 helper
 * ============================================
 *
 * 复用 LTY 现有 finance_bridge（Tailscale Funnel + FastAPI 网关）：
 *   FINANCE_BRIDGE_URL  base URL
 *   FINANCE_BRIDGE_KEY  shared secret
 *
 * 跟 lib/approvalFinanceHook.ts 的 sendCfoNotice 是同一接口，但抽出来
 * 给非财务模块（如 token 监控）也能用。
 *
 * 失败策略：log + 静默返 null，不抛异常。调用方场景多是异步告警，绝不
 * 能阻塞主业务（比如 token-usage 写入失败 = AI 阻塞）。
 */

export type BossNoticeRole = 'CFO' | 'TOKEN_BUDGET' | 'AI_OPS';

export type BossNoticeResult = {
  ok: boolean;
  tgMessageId?: number;
  error?: string;
};

/**
 * 异步推送通知给老板的 TG。
 * @param role 给 bridge 路由用，目前都同一个接收人；语义化区分日志方便回溯
 * @param content TG message body（HTML 格式：<b>/<i>/<code>）
 */
export async function sendBossNotice(
  role: BossNoticeRole,
  content: string,
): Promise<BossNoticeResult> {
  const baseUrl = process.env.FINANCE_BRIDGE_URL;
  const bridgeKey = process.env.FINANCE_BRIDGE_KEY;
  if (!baseUrl || !bridgeKey) {
    console.warn(`[notify:${role}] FINANCE_BRIDGE_URL/KEY 未配置，跳过 TG 通知`);
    return { ok: false, error: 'BRIDGE_NOT_CONFIGURED' };
  }
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/webhook/finance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Key': bridgeKey,
      },
      body: JSON.stringify({ role, content }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[notify:${role}] bridge POST failed`, res.status, text);
      return { ok: false, error: `HTTP_${res.status}` };
    }
    const j = (await res.json().catch(() => ({}))) as { tg_message_id?: number };
    return {
      ok: true,
      tgMessageId: typeof j.tg_message_id === 'number' ? j.tg_message_id : undefined,
    };
  } catch (e) {
    console.error(`[notify:${role}] bridge POST error`, e);
    return { ok: false, error: e instanceof Error ? e.message : 'UNKNOWN' };
  }
}

/** TG body 安全转义（防 HTML 注入） */
export function escapeTgHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
