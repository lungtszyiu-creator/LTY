/**
 * AI 平台月订阅管理 (/finance/subscriptions)
 *
 * 老板（仅 SUPER_ADMIN）录入公司订阅的各 AI / SaaS 平台月费：
 *   - Coze Credit 套餐 (HKD 400/月)
 *   - Perplexity Pro
 *   - Manus Pro
 *   - MiniMax Pro
 *   - 其他 AI / SaaS（OpenAI Team / Claude Pro / Cursor 等）
 *
 * 录入字段：vendor / displayName / monthlyHkd / billingDay /
 *   用途科目（默认「管理费用-AI 服务费」）/ 扣自科目（如「Perplexity 平台预付」）/
 *   起止日期 / 是否启用。
 *
 * 这张表由 PR-C 的 period-summary endpoint 月底自动汇总入账（凭证编制员
 * 拿数据写 voucher）。本页面只管"录入 + 改 + 软删"。
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { SubscriptionsClient, type SubRow } from './_components/SubscriptionsClient';

export const dynamic = 'force-dynamic';

export default async function FinanceSubscriptionsPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  // 只有 SUPER_ADMIN 能管理订阅 — 影响公司成本入账，权限收紧
  if (session.user.role !== 'SUPER_ADMIN') redirect('/finance');

  const subs = await prisma.aiCostSubscription.findMany({
    orderBy: [{ active: 'desc' }, { vendor: 'asc' }, { startedAt: 'desc' }],
    include: {
      createdBy: { select: { name: true } },
      _count: { select: { bookings: true } },
    },
  });

  const rows: SubRow[] = subs.map((s) => ({
    id: s.id,
    vendor: s.vendor,
    displayName: s.displayName,
    monthlyHkd: Number(s.monthlyHkd),
    monthlyAmountOriginal:
      s.monthlyAmountOriginal !== null ? Number(s.monthlyAmountOriginal) : null,
    currencyOriginal: s.currencyOriginal,
    billingDay: s.billingDay,
    purposeAccount: s.purposeAccount,
    fundingAccount: s.fundingAccount,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt?.toISOString() ?? null,
    active: s.active,
    notes: s.notes,
    bookingsCount: s._count.bookings,
    createdByName: s.createdBy?.name ?? null,
    createdAt: s.createdAt.toISOString(),
  }));

  // 计算月费汇总（启用中的订阅总额）
  const activeMonthlyTotal = rows
    .filter((r) => r.active)
    .reduce((sum, r) => sum + r.monthlyHkd, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <Link href="/finance" className="text-sm text-slate-500 hover:text-slate-800">
            ← 返回财务
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            AI 平台月订阅
          </h1>
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800 ring-1 ring-rose-300">
            👑 仅老板
          </span>
        </div>
      </header>

      <section className="mb-5 rounded-xl border border-emerald-300 bg-emerald-100/40 p-4 text-sm text-emerald-900">
        <strong>这张表跟「AI token 看板」配合做月底入账：</strong> 看板里
        <Link href="/dept/ai" className="underline">
          /dept/ai
        </Link>{' '}
        实时跑的 token 是变动成本（Coze tokens / 直接调 OpenAI 等）；本页录的
        是固定月订阅（Coze Credit 套餐 / Perplexity / Manus / MiniMax 等）。
        月底凭证编制员 AI 把两条线合算 → 按 vendor 分笔写 voucher 入账。
      </section>

      <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="启用中订阅"
          value={rows.filter((r) => r.active).length}
          accent="emerald"
        />
        <Kpi
          label="本月月费总额"
          value={`HKD ${activeMonthlyTotal.toLocaleString('zh-HK', {
            maximumFractionDigits: 2,
          })}`}
          accent="rose"
          monospace
        />
        <Kpi label="历史订阅" value={rows.length} accent="slate" />
        <Kpi
          label="累计入账记录"
          value={rows.reduce((s, r) => s + r.bookingsCount, 0)}
          accent="amber"
        />
      </section>

      <SubscriptionsClient initial={rows} />

      <VoucherClerkSopCard />
    </div>
  );
}

/**
 * 凭证编制员 SOP 折叠卡 — 给老板对照让 AI 怎么调 period-summary 自动入账。
 * 默认折叠，点开看完整调用流。
 */
function VoucherClerkSopCard() {
  return (
    <section className="mt-6 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-violet-900">
          📖 凭证编制员 SOP — 月底怎么把 AI 成本入账（点开看）
        </summary>
        <div className="mt-3 space-y-3 text-[13px] text-slate-700">
          <p>
            每月 1 号凭证编制员 AI 跑这套流程把上月 AI 成本写成 voucher 入账（按
            员工/订阅分笔）：
          </p>
          <ol className="ml-5 list-decimal space-y-2">
            <li>
              <strong>查上月汇总</strong>：调{' '}
              <code className="rounded bg-white px-1 font-mono text-[11px]">
                GET /api/v1/ai-cost/period-summary?month=2026-04
              </code>{' '}
              （X-Api-Key: 凭证编制员的 lty_xxx），拿到 \`tokenCosts[]\` + \`subscriptions[]\`，
              过滤 \`alreadyBooked: false\` 的条目。
            </li>
            <li>
              <strong>每个 token 员工写一笔 voucher</strong>（POST /api/finance/vouchers）：
              <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-2 font-mono text-[10px] leading-relaxed text-slate-100">
{`{
  "date": "2026-05-01",
  "summary": "2026-04 AI Token 成本 · {employeeName} · HKD {totalHkd}",
  "debitAccount": "管理费用-AI 服务费",
  "creditAccount": "Coze 平台预付",  // 或 OpenAI/Anthropic 平台预付按 model
  "amount": {totalHkd},
  "currency": "HKD",
  "createdByAi": "voucher_clerk",
  "notes": "{modelBreakdown 简述}"
}`}
              </pre>
            </li>
            <li>
              <strong>每个订阅写一笔 voucher</strong>，用 \`subscription.purposeAccount\` /
              \`fundingAccount\` 作为 用途/扣自 科目，金额 = \`monthlyHkd\`。摘要例
              \`"2026-04 月费 · Perplexity Pro · HKD 155.00"\`。
            </li>
            <li>
              <strong>每写完一笔立刻调 mark-booked</strong>（防重）：
              <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-2 font-mono text-[10px] leading-relaxed text-slate-100">
{`POST /api/v1/ai-cost/mark-booked
{
  "month": "2026-04",
  "aiEmployeeId": "...",      // 二选一
  "subscriptionId": "...",    // 二选一
  "voucherId": "<刚写的>",
  "totalHkd": <金额>,
  "meta": { "modelBreakdown": [...] }  // 可选
}`}
              </pre>
              撞重复返 409 + 现有 bookingId，凭证编制员要看到 409 就跳过该笔（说明
              别的 AI 或老板已经手动入过了）。
            </li>
            <li>
              <strong>Telegram 汇总通知老板</strong>：跑完后发一条 TG 写「上月 AI 成本入账完成
              · N 笔 voucher · HKD X 总额 · 详情看 /finance/vouchers?status=AI_DRAFT」。
              老板进 /finance 审 voucher 过账即可。
            </li>
          </ol>
          <p className="text-[11px] text-slate-500">
            完整接口签名 + 错误码见{' '}
            <code className="rounded bg-white px-1">/api/v1/ai-cost/period-summary</code> 跟{' '}
            <code className="rounded bg-white px-1">/api/v1/ai-cost/mark-booked</code> 的 doc
            注释。
          </p>
        </div>
      </details>
    </section>
  );
}

function Kpi({
  label,
  value,
  accent,
  monospace,
}: {
  label: string;
  value: number | string;
  accent: 'rose' | 'emerald' | 'amber' | 'slate';
  monospace?: boolean;
}) {
  const map: Record<typeof accent, string> = {
    rose: 'from-rose-100 to-rose-200/40 ring-rose-300/60 text-rose-800',
    emerald: 'from-emerald-100 to-emerald-200/40 ring-emerald-300/60 text-emerald-800',
    amber: 'from-amber-100 to-amber-200/40 ring-amber-300/60 text-amber-800',
    slate: 'from-slate-50 to-slate-100/40 ring-slate-200/60 text-slate-700',
  };
  return (
    <div className={`rounded-xl bg-gradient-to-br p-3 ring-1 ${map[accent]}`}>
      <div className="text-[10px] font-medium uppercase tracking-[0.16em] opacity-80">
        {label}
      </div>
      <div
        className={`mt-0.5 text-xl font-semibold tabular-nums sm:text-2xl ${
          monospace ? 'font-mono' : ''
        }`}
      >
        {value}
      </div>
    </div>
  );
}
