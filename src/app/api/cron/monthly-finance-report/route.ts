/**
 * 月度财务报表自动生成 cron（A3-1，2026-05-07）
 *
 * Vercel cron 每月 1 号 UTC 02:00 触发（对应 HK 10:00 上班时间老板看）。
 * 也支持手动 POST + Authorization: Bearer ${CRON_SECRET} + body { month?: "YYYY-MM" } 跑历史月。
 *
 * 流程：
 *  1. 计算月份范围（默认上月）
 *  2. 拉数据：vouchers / chain_transactions / reconciliations / fx_rates
 *  3. 后端模板填充数字（收入/支出/利润/资产/负债/汇兑成本/三方对账状态/大额 highlight）
 *  4. 触发 Coze workflow CFO 节点写 200-500 字"本月运营分析"
 *  5. 拼接完整月报 markdown
 *  6. 三向分发：TG（CFO bot 发摘要）+ GitHub vault commit 月报 md + 看板归档
 *
 * 设计哲学：
 *  - 数字部分**后端模板**控制（不让 AI 编数字）
 *  - 运营分析部分**AI 起草**（趋势、异常、建议）
 *  - 老板每月只需看一份 → 决策"OK 通过"或"哪里要调整"
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const TG_API = 'https://api.telegram.org';

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const got = req.headers.get('authorization');
  return got === `Bearer ${expected}`;
}

type MonthRange = { yearMonth: string; start: Date; end: Date };

function defaultLastMonth(): MonthRange {
  // 默认跑"上个月"（cron 在每月 1 号跑，对应处理上月数据）
  const now = new Date();
  const startOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endOfLastMonth = new Date(startOfThisMonth.getTime() - 1);
  const startOfLastMonth = new Date(Date.UTC(endOfLastMonth.getUTCFullYear(), endOfLastMonth.getUTCMonth(), 1));
  const yearMonth = `${endOfLastMonth.getUTCFullYear()}-${String(endOfLastMonth.getUTCMonth() + 1).padStart(2, '0')}`;
  return { yearMonth, start: startOfLastMonth, end: startOfThisMonth };
}

function parseMonthArg(arg: string): MonthRange | null {
  const m = arg.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isInteger(year) || year < 2020 || year > 2099) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { yearMonth: arg, start, end };
}

type Totals = {
  vouchers: { count: number; postedCount: number; aiDraftCount: number; voidedCount: number };
  byCurrency: Record<string, { revenue: number; expense: number; net: number }>;
  largeTxs: Array<{ id: string; date: string; summary: string; amount: number; currency: string }>;
  chainTxs: { count: number; inboundCount: number; outboundCount: number };
  fxRatesCount: number;
  reconciliations: { count: number; openCount: number; resolvedCount: number };
};

async function aggregateMonth(range: MonthRange): Promise<Totals> {
  const vouchers = await prisma.voucher.findMany({
    where: { date: { gte: range.start, lt: range.end } },
    select: {
      id: true, date: true, summary: true, debitAccount: true, creditAccount: true,
      amount: true, currency: true, status: true,
    },
  });

  const totals: Totals = {
    vouchers: { count: vouchers.length, postedCount: 0, aiDraftCount: 0, voidedCount: 0 },
    byCurrency: {},
    largeTxs: [],
    chainTxs: { count: 0, inboundCount: 0, outboundCount: 0 },
    fxRatesCount: 0,
    reconciliations: { count: 0, openCount: 0, resolvedCount: 0 },
  };

  for (const v of vouchers) {
    if (v.status === 'POSTED') totals.vouchers.postedCount++;
    else if (v.status === 'AI_DRAFT') totals.vouchers.aiDraftCount++;
    else if (v.status === 'VOIDED') totals.vouchers.voidedCount++;

    if (v.status === 'VOIDED') continue;

    const cur = v.currency.toUpperCase();
    if (!totals.byCurrency[cur]) totals.byCurrency[cur] = { revenue: 0, expense: 0, net: 0 };
    const amount = Number(v.amount);
    // 简化：creditAccount 含"主营业务收入"或"其他业务收入"算收入；含"管理/销售/财务费用"算支出
    if (/主营业务收入|其他业务收入|营业外收入|利息收入/.test(v.creditAccount)) {
      totals.byCurrency[cur].revenue += amount;
    } else if (/管理费用|销售费用|财务费用|营业外支出/.test(v.debitAccount)) {
      totals.byCurrency[cur].expense += amount;
    }

    if (amount >= 5000) {
      // 大额 highlight：单笔 >= 5000 等值（不严格折算 USD，跨币种粗略）
      totals.largeTxs.push({
        id: v.id,
        date: v.date.toISOString().slice(0, 10),
        summary: v.summary,
        amount,
        currency: cur,
      });
    }
  }
  // net = revenue - expense
  for (const cur of Object.keys(totals.byCurrency)) {
    const c = totals.byCurrency[cur];
    c.net = c.revenue - c.expense;
  }
  totals.largeTxs.sort((a, b) => b.amount - a.amount);
  totals.largeTxs = totals.largeTxs.slice(0, 10);

  const chainTxsCount = await prisma.chainTransaction.count({
    where: { timestamp: { gte: range.start, lt: range.end } },
  });
  // inbound/outbound 简单分：toWalletId 是公司钱包 = inbound
  const inboundCount = await prisma.chainTransaction.count({
    where: {
      timestamp: { gte: range.start, lt: range.end },
      toWalletId: { not: null },
    },
  });
  totals.chainTxs.count = chainTxsCount;
  totals.chainTxs.inboundCount = inboundCount;
  totals.chainTxs.outboundCount = chainTxsCount - inboundCount;

  totals.fxRatesCount = await prisma.fxRate.count({
    where: { date: { gte: range.start, lt: range.end } },
  });

  const recons = await prisma.reconciliation.findMany({
    where: { period: range.yearMonth },
    select: { status: true },
  });
  totals.reconciliations.count = recons.length;
  totals.reconciliations.openCount = recons.filter((r) => r.status === 'OPEN' || r.status === 'ESCALATED').length;
  totals.reconciliations.resolvedCount = recons.filter((r) => r.status === 'RESOLVED').length;

  return totals;
}

function fmt(n: number): string {
  if (Math.abs(n) >= 10000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return n.toFixed(2);
}

function buildReportMarkdown(range: MonthRange, totals: Totals, aiAnalysis: string): string {
  const lines: string[] = [];
  lines.push(`# LTY 旭珑 · ${range.yearMonth} 月度财务报表`);
  lines.push('');
  lines.push(`**数据期间**：${range.start.toISOString().slice(0, 10)} ~ ${new Date(range.end.getTime() - 1).toISOString().slice(0, 10)}`);
  lines.push(`**生成时间**：${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`);
  lines.push(`**生成方式**：自动（cron + AI 起草分析）`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // 收支汇总
  lines.push('## 1. 收支汇总（按币种）');
  lines.push('');
  if (Object.keys(totals.byCurrency).length === 0) {
    lines.push('_本月无凭证数据。_');
  } else {
    lines.push('| 币种 | 收入 | 支出 | 净额 |');
    lines.push('|---|---:|---:|---:|');
    for (const cur of Object.keys(totals.byCurrency).sort()) {
      const c = totals.byCurrency[cur];
      lines.push(`| ${cur} | ${fmt(c.revenue)} | ${fmt(c.expense)} | ${fmt(c.net)} |`);
    }
  }
  lines.push('');

  // 凭证统计
  lines.push('## 2. 凭证统计');
  lines.push('');
  lines.push(`- 总数：**${totals.vouchers.count}**`);
  lines.push(`  - POSTED（已记账）：${totals.vouchers.postedCount}`);
  lines.push(`  - AI_DRAFT（待复核）：${totals.vouchers.aiDraftCount}`);
  lines.push(`  - VOIDED（已撤销）：${totals.vouchers.voidedCount}`);
  lines.push('');

  // 链上交易
  lines.push('## 3. 链上交易');
  lines.push('');
  lines.push(`- 总数：**${totals.chainTxs.count}**`);
  lines.push(`  - Inbound（公司钱包入账）：${totals.chainTxs.inboundCount}`);
  lines.push(`  - Outbound（公司钱包出账）：${totals.chainTxs.outboundCount}`);
  lines.push('');

  // 三方对账
  lines.push('## 4. 三方对账状态');
  lines.push('');
  if (totals.reconciliations.count === 0) {
    lines.push('_本月未跑对账（reconciler cron 未执行或无数据）。_');
  } else {
    lines.push(`- 已跑对账批次：**${totals.reconciliations.count}**`);
    lines.push(`  - RESOLVED（已对平）：${totals.reconciliations.resolvedCount}`);
    lines.push(`  - OPEN/ESCALATED（待处理差异）：**${totals.reconciliations.openCount}**`);
  }
  lines.push('');

  // 汇率快照
  lines.push('## 5. 汇率快照');
  lines.push('');
  lines.push(`本月共记录 **${totals.fxRatesCount}** 条汇率快照。`);
  lines.push('');

  // 大额 highlight
  lines.push('## 6. 大额交易 Top 10（≥ 5000 等值）');
  lines.push('');
  if (totals.largeTxs.length === 0) {
    lines.push('_本月无大额交易。_');
  } else {
    lines.push('| 日期 | 摘要 | 金额 | 币种 | 凭证 ID |');
    lines.push('|---|---|---:|---|---|');
    for (const t of totals.largeTxs) {
      lines.push(`| ${t.date} | ${t.summary.slice(0, 50)} | ${fmt(t.amount)} | ${t.currency} | ${t.id.slice(0, 8)} |`);
    }
  }
  lines.push('');

  // AI 运营分析
  lines.push('---');
  lines.push('');
  lines.push('## 7. 运营分析（AI 起草，老板审签）');
  lines.push('');
  lines.push(aiAnalysis || '_AI 分析未生成（Coze workflow 调用失败或数据不足）。_');
  lines.push('');

  // 待办 / 决策点
  lines.push('---');
  lines.push('');
  lines.push('## 8. 待老板决策');
  lines.push('');
  if (totals.reconciliations.openCount > 0) {
    lines.push(`- [!] **${totals.reconciliations.openCount} 条未解决的对账差异**，去看板 /finance/reconciliations 处理`);
  }
  if (totals.vouchers.aiDraftCount > 0) {
    lines.push(`- [!] **${totals.vouchers.aiDraftCount} 条 AI_DRAFT 凭证待复核**，去看板 /finance/vouchers 批量审核`);
  }
  if (totals.largeTxs.length > 0) {
    lines.push(`- [!] **${totals.largeTxs.length} 条 ≥5000 大额交易**，建议老板逐条 review`);
  }
  if (totals.reconciliations.openCount === 0 && totals.vouchers.aiDraftCount === 0) {
    lines.push('- 本月无待决策项，[完成] 正常签发');
  }

  return lines.join('\n');
}

async function triggerAiAnalysis(reportSummary: string): Promise<string> {
  const baseUrl = (process.env.COZE_API_BASE || 'https://api.coze.com').replace(/\/$/, '');
  const token = process.env.COZE_API_TOKEN || '';
  const workflowId = process.env.COZE_WORKFLOW_ID || '';
  const inputParam = process.env.COZE_INPUT_PARAM_NAME || 'input';
  if (!token || !workflowId) {
    console.warn('[monthly-finance-report] COZE_API_TOKEN / COZE_WORKFLOW_ID 未配置，跳过 AI 分析');
    return '';
  }
  const prompt = `MONTHLY_ANALYSIS:\n请基于以下月度数据写 200-400 字的运营分析（趋势、异常、给老板的建议）。不要重述数字，重点是"为什么"和"怎么办"。\n\n${reportSummary}`;
  try {
    const res = await fetch(`${baseUrl}/v1/workflow/run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: workflowId,
        parameters: { [inputParam]: prompt },
      }),
    });
    if (!res.ok) {
      console.error('[monthly-finance-report] coze HTTP error', res.status);
      return '';
    }
    const j = (await res.json()) as { code?: number; data?: unknown; msg?: string };
    if (j.code !== 0) {
      console.error('[monthly-finance-report] coze workflow err', j.code, j.msg);
      return '';
    }
    let parsedOutput: unknown = j.data;
    if (typeof j.data === 'string') {
      try {
        parsedOutput = JSON.parse(j.data);
      } catch {
        parsedOutput = { output: j.data };
      }
    }
    const out = (parsedOutput as { output?: string })?.output;
    return typeof out === 'string' ? out : JSON.stringify(parsedOutput).slice(0, 2000);
  } catch (e) {
    console.error('[monthly-finance-report] coze exception', e);
    return '';
  }
}

function buildSummaryForAi(range: MonthRange, totals: Totals): string {
  const lines: string[] = [];
  lines.push(`月份：${range.yearMonth}`);
  lines.push(`凭证总数 ${totals.vouchers.count}（POSTED ${totals.vouchers.postedCount} / AI_DRAFT ${totals.vouchers.aiDraftCount} / VOIDED ${totals.vouchers.voidedCount}）`);
  for (const cur of Object.keys(totals.byCurrency).sort()) {
    const c = totals.byCurrency[cur];
    lines.push(`${cur}：收入 ${fmt(c.revenue)} / 支出 ${fmt(c.expense)} / 净 ${fmt(c.net)}`);
  }
  lines.push(`链上交易 ${totals.chainTxs.count}（in ${totals.chainTxs.inboundCount} / out ${totals.chainTxs.outboundCount}）`);
  lines.push(`对账批次 ${totals.reconciliations.count}（已对平 ${totals.reconciliations.resolvedCount} / 待处理差异 ${totals.reconciliations.openCount}）`);
  if (totals.largeTxs.length > 0) {
    lines.push('大额 Top 5：');
    for (const t of totals.largeTxs.slice(0, 5)) {
      lines.push(`- ${t.date} ${t.summary.slice(0, 30)} ${fmt(t.amount)} ${t.currency}`);
    }
  }
  return lines.join('\n');
}

async function commitReportToVault(yearMonth: string, markdown: string): Promise<string | null> {
  const token = process.env.VAULT_GITHUB_TOKEN || process.env.GITHUB_VAULT_TOKEN;
  if (!token) {
    console.warn('[monthly-finance-report] VAULT_GITHUB_TOKEN 未配置，跳过 GitHub commit');
    return null;
  }
  const repo = 'lungtszyiu-creator/lty-vault';
  const path = `raw/财务部/monthly_reports/${yearMonth}.md`;
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
  const message = `feat(finance/monthly): ${yearMonth} 月度财务报表（自动生成）`;
  const content = Buffer.from(markdown, 'utf-8').toString('base64');

  try {
    // 看 path 是否已存在（拿 sha）
    const getRes = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    let sha: string | undefined;
    if (getRes.ok) {
      const j = (await getRes.json()) as { sha?: string };
      sha = j.sha;
    }
    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, content, sha, committer: { name: 'LTY Cron', email: 'cron@lty.local' } }),
    });
    if (!putRes.ok) {
      console.error('[monthly-finance-report] github commit failed', putRes.status, await putRes.text().catch(() => ''));
      return null;
    }
    const j = (await putRes.json()) as { content?: { html_url?: string } };
    return j.content?.html_url ?? null;
  } catch (e) {
    console.error('[monthly-finance-report] github exception', e);
    return null;
  }
}

async function notifyTelegram(yearMonth: string, totals: Totals, vaultUrl: string | null): Promise<void> {
  const baseUrl = process.env.FINANCE_BRIDGE_URL;
  const bridgeKey = process.env.FINANCE_BRIDGE_KEY;
  if (!baseUrl || !bridgeKey) return;
  const lines: string[] = [];
  lines.push(`<b>[CFO 月报] ${yearMonth} 财务月报已生成</b>`);
  lines.push('');
  lines.push(`凭证 ${totals.vouchers.count} 条 / 链上 ${totals.chainTxs.count} 笔`);
  for (const cur of Object.keys(totals.byCurrency).sort()) {
    const c = totals.byCurrency[cur];
    lines.push(`${cur}：收 ${fmt(c.revenue)} / 支 ${fmt(c.expense)} / 净 ${fmt(c.net)}`);
  }
  if (totals.reconciliations.openCount > 0) {
    lines.push(`<b>[!] 待处理差异 ${totals.reconciliations.openCount} 条</b>`);
  }
  if (totals.vouchers.aiDraftCount > 0) {
    lines.push(`<b>[!] AI 草稿凭证 ${totals.vouchers.aiDraftCount} 条待复核</b>`);
  }
  if (vaultUrl) {
    lines.push('');
    lines.push(`<a href="${vaultUrl}">查看完整月报（vault）</a>`);
  }

  try {
    await fetch(`${baseUrl.replace(/\/$/, '')}/webhook/finance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Key': bridgeKey },
      body: JSON.stringify({ role: 'CFO', content: lines.join('\n') }),
    });
  } catch (e) {
    console.error('[monthly-finance-report] tg notify failed', e);
  }
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let body: { month?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const range = body.month ? parseMonthArg(body.month) : defaultLastMonth();
  if (!range) return NextResponse.json({ error: 'INVALID_MONTH', got: body.month }, { status: 400 });

  console.log(`[monthly-finance-report] start month=${range.yearMonth}`);

  const totals = await aggregateMonth(range);
  const summaryForAi = buildSummaryForAi(range, totals);
  const aiAnalysis = await triggerAiAnalysis(summaryForAi);
  const markdown = buildReportMarkdown(range, totals, aiAnalysis);

  const vaultUrl = await commitReportToVault(range.yearMonth, markdown);
  await notifyTelegram(range.yearMonth, totals, vaultUrl);

  return NextResponse.json({
    ok: true,
    month: range.yearMonth,
    totals,
    aiAnalysisLength: aiAnalysis.length,
    vaultUrl,
  });
}
