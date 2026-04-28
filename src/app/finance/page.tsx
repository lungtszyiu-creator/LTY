/**
 * 财务模块主页 (/finance)
 *
 * 老板的"被动可视化"入口 —— 不用打开 AI、不用看 TG，直接看到 AI 都干了什么。
 *
 * 内容：
 * - KPI 块（待审凭证 / 在用钱包 / 当月活动数）
 * - AI 活动流（时间倒序，最近 50 条）
 * - 待审凭证表
 * - 钱包总览
 * - 银行账户总览
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireFinanceView } from '@/lib/finance-access';

export const dynamic = 'force-dynamic';

export default async function FinancePage() {
  // 三重门禁：未登录 → /login；已登录但 financeRole=null → 跳回 /dashboard（不暴露页面存在）；
  // 通过后返回访问级别（VIEWER 或 EDITOR），决定 UI 上是否显示写入操作
  const access = await requireFinanceView();

  // 并行抓数据
  const [
    pendingVouchersCount,
    walletsCount,
    monthActivityCount,
    pendingVouchers,
    recentActivity,
    wallets,
    bankAccounts,
  ] = await Promise.all([
    prisma.voucher.count({ where: { status: 'AI_DRAFT' } }),
    prisma.cryptoWallet.count({ where: { isActive: true } }),
    prisma.aiActivityLog.count({
      where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    }),
    prisma.voucher.findMany({
      where: { status: 'AI_DRAFT' },
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { name: true } } },
    }),
    prisma.aiActivityLog.findMany({
      take: 30,
      orderBy: { createdAt: 'desc' },
      include: { apiKey: { select: { name: true, scope: true } } },
    }),
    prisma.cryptoWallet.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      take: 20,
      include: { holderUser: { select: { name: true } } },
    }),
    prisma.bankAccount.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      take: 10,
    }),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">财务</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
              access.level === 'EDITOR'
                ? 'bg-rose-50 text-rose-700 ring-rose-200'
                : 'bg-sky-50 text-sky-700 ring-sky-200'
            }`}
          >
            {access.level === 'EDITOR' ? '👑 全权' : '👁 只读'}
          </span>
        </div>
        <span className="text-xs text-slate-400">数据每次刷新页面即更新</span>
      </header>

      {/* KPI 三连 */}
      <section className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="待审凭证"
          value={pendingVouchersCount}
          accent="rose"
          hint="AI_DRAFT 状态，待你点确认"
        />
        <KpiCard
          label="在用钱包"
          value={walletsCount}
          accent="amber"
          hint="主数据，链上记账员监控对象"
        />
        <KpiCard
          label="近 30 天 AI 活动"
          value={monthActivityCount}
          accent="emerald"
          hint="所有 AI 调 API 的次数"
        />
      </section>

      {/* AI 活动流 */}
      <section className="mb-8">
        <SectionTitle>AI 活动流</SectionTitle>
        {recentActivity.length === 0 ? (
          <EmptyHint text="暂无 AI 活动。等 5 个 AI 开始干活就会出现在这里。" />
        ) : (
          <ul className="divide-y divide-slate-200/60 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {recentActivity.map((log) => (
              <li key={log.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="flex min-w-0 items-baseline gap-2">
                  <RoleBadge role={log.aiRole} />
                  <span className="truncate text-slate-700">{log.action}</span>
                  {log.errorMessage && (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-600 ring-1 ring-rose-200">
                      失败
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                  <ChannelDots
                    tg={log.telegramSent}
                    vault={log.vaultWritten}
                    db={log.dashboardWritten}
                  />
                  <time>{formatTime(log.createdAt)}</time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 待审凭证 */}
      <section className="mb-8">
        <SectionTitle>
          待审凭证（{pendingVouchers.length}）
          {pendingVouchers.length > 0 && (
            <span className="ml-2 text-xs font-normal text-rose-500">需要你点确认</span>
          )}
        </SectionTitle>
        {pendingVouchers.length === 0 ? (
          <EmptyHint text="无待审凭证。" />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">日期</th>
                  <th className="px-4 py-2 text-left">摘要</th>
                  <th className="px-4 py-2 text-left">借</th>
                  <th className="px-4 py-2 text-left">贷</th>
                  <th className="px-4 py-2 text-right">金额</th>
                  <th className="px-4 py-2 text-left">来源</th>
                  <th className="px-4 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {pendingVouchers.map((v) => (
                  <tr key={v.id} className="border-t border-slate-100 transition hover:bg-amber-50/40">
                    <td className="px-4 py-2 whitespace-nowrap text-slate-600">
                      <Link href={`/finance/vouchers/${v.id}`} className="block">
                        {v.date.toISOString().slice(0, 10)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-slate-800">
                      <Link href={`/finance/vouchers/${v.id}`} className="block">
                        {v.summary}
                      </Link>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-slate-600">{v.debitAccount}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-slate-600">{v.creditAccount}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-right font-medium tabular-nums text-slate-900">
                      {v.amount.toString()} {v.currency}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-500">
                      {v.createdByAi ? `🤖 ${v.createdByAi}` : v.createdBy?.name ?? '人工'}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-right">
                      <Link
                        href={`/finance/vouchers/${v.id}`}
                        className="inline-flex items-center rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-rose-700"
                      >
                        审核 →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 钱包 / 银行 双栏 */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <SectionTitle>钱包总览（{wallets.length}）</SectionTitle>
          {wallets.length === 0 ? (
            <EmptyHint text="未登记钱包。" />
          ) : (
            <ul className="space-y-2">
              {wallets.map((w) => (
                <li
                  key={w.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800">{w.label}</div>
                    <div className="font-mono text-xs text-slate-500">
                      {w.address.slice(0, 6)}…{w.address.slice(-4)}{' '}
                      <span className="text-slate-400">· {w.chain}</span>
                    </div>
                  </div>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 ring-1 ring-amber-200">
                    {holderTypeLabel(w.holderType)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <SectionTitle>银行账户（{bankAccounts.length}）</SectionTitle>
          {bankAccounts.length === 0 ? (
            <EmptyHint text="未登记银行账户。" />
          ) : (
            <ul className="space-y-2">
              {bankAccounts.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800">{b.label}</div>
                    <div className="text-xs text-slate-500">
                      {b.bankName} · {b.accountNumber.slice(0, 4)}…{b.accountNumber.slice(-4)}
                    </div>
                  </div>
                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700 ring-1 ring-sky-200">
                    {b.currency}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {access.level === 'EDITOR' && (
        <footer className="mt-10 rounded-xl border border-amber-200/60 bg-amber-50/40 p-4 text-xs text-amber-900">
          💡 仅老板可见 · 想让 AI 写到这里？在{' '}
          <Link href="/admin/finance/api-keys" className="underline">
            管理 → 财务 API Key 管理
          </Link>{' '}
          创建对应角色的 API Key，发给 Coze / n8n 用。授予/收回他人查看权限请去{' '}
          <Link href="/admin/finance/access" className="underline">
            管理 → 财务访问授权
          </Link>
          。
        </footer>
      )}
      {access.level === 'VIEWER' && (
        <footer className="mt-10 rounded-xl border border-sky-200/60 bg-sky-50/40 p-4 text-xs text-sky-900">
          👁 你是只读账号。只能查看，不能修改。需要写权限请联系老板。
        </footer>
      )}
    </main>
  );
}

// ---- helpers ----
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">{children}</h2>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-sm text-slate-400">
      {text}
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: number;
  accent: 'rose' | 'amber' | 'emerald';
  hint?: string;
}) {
  const accentMap = {
    rose: 'from-rose-50 to-rose-100/40 ring-rose-200/60 text-rose-700',
    amber: 'from-amber-50 to-amber-100/40 ring-amber-200/60 text-amber-700',
    emerald: 'from-emerald-50 to-emerald-100/40 ring-emerald-200/60 text-emerald-700',
  } as const;
  return (
    <div
      className={`rounded-xl bg-gradient-to-br p-4 ring-1 ${accentMap[accent]}`}
    >
      <div className="text-xs font-medium uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs opacity-70">{hint}</div>}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    voucher_clerk: { label: '凭证编制员', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
    chain_bookkeeper: { label: '链上记账员', cls: 'bg-purple-50 text-purple-700 ring-purple-200' },
    forex_lookout: { label: '汇率瞭望员', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
    reconciler: { label: '对账员', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    cfo: { label: 'CFO', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  };
  const m = map[role] ?? { label: role, cls: 'bg-slate-50 text-slate-600 ring-slate-200' };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

function ChannelDots({ tg, vault, db }: { tg: boolean; vault: boolean; db: boolean }) {
  return (
    <span className="flex items-center gap-1" title="TG / Vault / DB 三向分发">
      <Dot active={tg} color="sky" letter="T" title="Telegram" />
      <Dot active={vault} color="amber" letter="V" title="Vault" />
      <Dot active={db} color="emerald" letter="D" title="DB" />
    </span>
  );
}

function Dot({
  active,
  color,
  letter,
  title,
}: {
  active: boolean;
  color: 'sky' | 'amber' | 'emerald';
  letter: string;
  title: string;
}) {
  const cls = active
    ? color === 'sky'
      ? 'bg-sky-500 text-white'
      : color === 'amber'
      ? 'bg-amber-500 text-white'
      : 'bg-emerald-500 text-white'
    : 'bg-slate-200 text-slate-400';
  return (
    <span
      title={title}
      className={`inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold ${cls}`}
    >
      {letter}
    </span>
  );
}

function holderTypeLabel(t: string): string {
  const map: Record<string, string> = {
    BOSS: '老板',
    COMPANY_CASHIER: '出纳',
    EMPLOYEE: '员工',
    TREASURY: '储备',
    EXTERNAL: '外部',
  };
  return map[t] ?? t;
}

function formatTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return d.toISOString().slice(0, 16).replace('T', ' ');
}
