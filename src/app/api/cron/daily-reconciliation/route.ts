/**
 * 每日 18:00 (HK) 三方对账 cron（A3-4，2026-05-07）
 *
 * Vercel cron 每日 UTC 10:00 触发（= HK 18:00 下班对账）。
 * 触发 Coze workflow → reconciler 节点：
 *  - 逐户余额：链上钱包 vs 账面（其他货币资金科目）
 *  - 银行余额（出纳上传的银行流水 vs 账面银行存款）—— 暂未真接入，AI 跳过
 *  - Aave aUSDC 余额 vs 账面"其他货币资金-Aave"
 *  - 应收应付：本日新增凭证对方科目余额变动
 *  - 输出 create_reconciliation + send_to_telegram + archive_to_obsidian
 *
 * 差异 > 100 USD 主动告警老板（reconciler prompt 里已写）。
 */
import { NextRequest, NextResponse } from 'next/server';

// reconciler 要拉多表数据 + AI 分析差异，给 180s 充裕
export const maxDuration = 180;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const got = req.headers.get('authorization');
  return got === `Bearer ${expected}`;
}

const PROMPT = `DAILY_RECONCILIATION:
请按你的日终对账模板跑今日三方对账：
1. 逐户余额：链上钱包 vs 账面"其他货币资金"（用 list_chain_transactions + list_vouchers + list_wallets 拉数据）
2. Aave aUSDC 余额 vs 账面"其他货币资金-Aave"
3. 应收应付：今日新增凭证对方科目余额变动
4. 输出对账结果（period=今日 YYYY-MM-DD scope=DAILY）到 create_reconciliation
差异 > 100 USD 必须 send_to_telegram 主动告警老板（"@LTY01_bot 差异告警..."）。
找不到原因的差异标 unknown，不许"调平"凑数。
完成后三向分发：create_reconciliation + send_to_telegram + archive_to_obsidian。`;

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const baseUrl = (process.env.COZE_API_BASE || 'https://api.coze.com').replace(/\/$/, '');
  const token = process.env.COZE_API_TOKEN;
  const workflowId = process.env.COZE_WORKFLOW_ID;
  const inputParam = process.env.COZE_INPUT_PARAM_NAME || 'input';
  if (!token || !workflowId) {
    return NextResponse.json({ error: 'COZE_NOT_CONFIGURED' }, { status: 500 });
  }

  try {
    const res = await fetch(`${baseUrl}/v1/workflow/run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_id: workflowId,
        parameters: { [inputParam]: PROMPT },
      }),
    });
    const j = (await res.json()) as { code?: number; data?: unknown; msg?: string; execute_id?: string };
    if (j.code !== 0) {
      console.error('[daily-reconciliation] coze err', j.code, j.msg);
      return NextResponse.json({ error: 'COZE_WORKFLOW_FAILED', code: j.code, msg: j.msg }, { status: 502 });
    }
    return NextResponse.json({ ok: true, executeId: j.execute_id });
  } catch (e) {
    console.error('[daily-reconciliation] exception', e);
    return NextResponse.json({ error: 'EXCEPTION', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}
