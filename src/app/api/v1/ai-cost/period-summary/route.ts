/**
 * AI 月度成本汇总端点（凭证编制员调用）
 *
 * GET /api/v1/ai-cost/period-summary?month=2026-04
 *
 * 鉴权：双轨
 *   - X-Api-Key (FINANCE_AI:voucher_clerk / FINANCE_AI:cfo / FINANCE_ADMIN /
 *     FINANCE_READONLY) — 凭证编制员/CFO/出纳读
 *   - 或 NextAuth session (财务 VIEWER+ + active) — 老板看 /dept/ai 卡片用
 *
 * 返回结构见 lib/ai-cost-period.ts → PeriodSummary
 *
 * 凭证编制员用法（PR-C SOP）：
 *   1. 每月 1 号查上月 (?month=2026-04 即查 2026 年 4 月)
 *   2. 看 tokenCosts[] + subscriptions[] 哪些 alreadyBooked=false
 *   3. 按 C 选项老板要按 (员工/订阅) 分笔，每条 alreadyBooked=false 写一笔
 *      voucher：
 *        - 用途科目: 该订阅的 purposeAccount 或员工的「管理费用-AI 服务费」
 *        - 扣自科目: 该订阅的 fundingAccount 或员工的对应平台预付
 *        - 摘要：例 "2026-04 AI 月费 · Perplexity Pro · HKD 155.00"
 *        - 金额：totalHkd / monthlyHkd
 *   4. 写完每笔 voucher 立刻调 POST /api/v1/ai-cost/mark-booked 标记防重
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthOrApiKey } from '@/lib/api-auth';
import { computePeriodSummary, hkMonthOf } from '@/lib/ai-cost-period';

export const dynamic = 'force-dynamic';

const ALLOWED_SCOPES = [
  'FINANCE_AI:voucher_clerk',
  'FINANCE_AI:cfo',
  'FINANCE_AI:reconciler',
  'FINANCE_ADMIN',
  'FINANCE_READONLY',
];

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthOrApiKey(req, ALLOWED_SCOPES, 'VIEW');
    if (auth instanceof NextResponse) return auth;

    const url = new URL(req.url);
    const monthRaw = url.searchParams.get('month');
    // 默认上月（凭证编制员每月 1 号跑会调上月）
    const month = monthRaw ?? defaultLastMonthHk();

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json(
        {
          error: 'INVALID_MONTH',
          hint: 'month 格式必须是 YYYY-MM (例 2026-04)，省略则默认上月',
        },
        { status: 400 },
      );
    }

    const summary = await computePeriodSummary(month);
    return NextResponse.json({
      ...summary,
      _auth: auth.kind,
      _scope: auth.kind === 'apikey' ? auth.ctx.scope : undefined,
    });
  } catch (e) {
    if (e instanceof Response) return e as unknown as NextResponse;
    console.error('[ai-cost period-summary GET] uncaught:', e);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', hint: e instanceof Error ? e.message : '服务端未知错误' },
      { status: 500 },
    );
  }
}

/** 上个月 HK 时区，例当前 5/10 → "2026-04" */
function defaultLastMonthHk(): string {
  const now = new Date();
  // 减 30 天再求 month，跨月即拿上月，月初也安全
  const back = new Date(now.getTime() - 30 * 24 * 3600_000);
  return hkMonthOf(back);
}
