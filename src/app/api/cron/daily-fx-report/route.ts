/**
 * 每日 09:00 (HK) 汇率早报 cron（A3-3，2026-05-07）
 *
 * Vercel cron 每日 UTC 01:00 触发（= HK 09:00 上班）。
 * 直接调 Coze workflow 让 forex_lookout AI 跑早报：
 *  - 拉 USDT/HKD / USDT/CNY / HKD/CNY 多平台报价
 *  - 对比 7 日趋势 + MSO 实际成交价
 *  - 输出早报模板 + 异常提示
 *  - 三向分发到 TG（汇率瞭望员 bot）/ vault / 看板
 *
 * AI 全自动，cron 只起 trigger 作用。
 */
import { NextRequest, NextResponse } from 'next/server';

// forex_lookout 要拉多平台 API + 写早报，可能 60-120s
export const maxDuration = 180;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const got = req.headers.get('authorization');
  return got === `Bearer ${expected}`;
}

const PROMPT = `DAILY_FX_REPORT:
请按你的早报模板拉今日 USDT/HKD、USDT/CNY、HKD/CNY 多平台报价，对比 7 日趋势 + MSO 实际成交价，输出早报。
检测以下风险并主动告警：
- MSO 报价偏离 HKMA 中间价 > 0.3%（被薅迹象）
- USDT 脱锚 > 0.5%
- 任一币种 24h 波动 > 2%
完成后三向分发：send_to_telegram + create_fx_rate（看板归档）+ archive_to_obsidian。`;

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
      console.error('[daily-fx-report] coze err', j.code, j.msg);
      return NextResponse.json({ error: 'COZE_WORKFLOW_FAILED', code: j.code, msg: j.msg }, { status: 502 });
    }
    return NextResponse.json({ ok: true, executeId: j.execute_id });
  } catch (e) {
    console.error('[daily-fx-report] exception', e);
    return NextResponse.json({ error: 'EXCEPTION', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}
