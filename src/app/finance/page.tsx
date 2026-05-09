/**
 * 财务模块主页 (/finance)
 *
 * 老板的"被动可视化"入口 —— 不用打开 AI、不用看 TG，直接看到 AI 都干了什么。
 *
 * 布局（mobile-first）：
 * - 顶部 KPI 三连（始终可见，作为快速扫读区）
 * - Tabs（概览 / 余额快照 / AI 活动）—— 用 ?tab=... URL 参数驱动，RSC 友好
 *   - 概览：待审凭证（mobile 卡片 / desktop 表格）+ 钱包/银行总览
 *   - 余额快照：钱包余额最新切片
 *   - AI 活动：5 个 AI 调 API 的时间流
 * - 工具按钮（仅 EDITOR）收进 footer 的 <details>，默认折叠，避免 3 个 admin 按钮散在底部
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireFinanceView } from '@/lib/finance-access';
import { CleanupTestsButton } from './cleanup-tests-button';
import { CleanupVaultTestsButton } from './cleanup-vault-tests-button';
import { VaultIngestButton } from './vault-ingest-button';
import { VoucherDeleteButton } from './voucher-delete-button';
import { DeptApiKeysCard } from '@/components/dept/DeptApiKeysCard';
import { getScopeChoices } from '@/lib/scope-presets';
import { AddWalletBankBar } from './_components/AddWalletBankBar';
import { shortenEthAddressesIn } from '@/lib/finance-format';

export const dynamic = 'force-dynamic';

type TabKey = 'overview' | 'snapshots' | 'activity';

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // 三重门禁：未登录 → /login；已登录但 financeRole=null → 跳回 /dashboard（不暴露页面存在）；
  // 通过后返回访问级别（VIEWER 或 EDITOR），决定 UI 上是否显示写入操作
  const access = await requireFinanceView();
  const sp = await searchParams;
  const tab: TabKey =
    sp.tab === 'snapshots' ? 'snapshots' : sp.tab === 'activity' ? 'activity' : 'overview';

  // 并行抓数据（不管哪个 tab 都跑完，admin 页面流量低，简化优先）
  const [
    pendingVouchersCount,
    walletsCount,
    monthActivityCount,
    pendingVouchers,
    recentActivity,
    wallets,
    bankAccounts,
    totalSnapshotCount,
    latestSnapshotMeta,
    recentSnapshots,
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
    prisma.walletBalanceSnapshot.count(),
    prisma.walletBalanceSnapshot.findFirst({
      orderBy: { asOf: 'desc' },
      select: { asOf: true },
    }),
    // 取过去 36h 的快照（cron 每天跑一次，36h 兜住跨日 + 偶发延迟），
    // 客户端 group by (walletId, token) 取最新一条
    prisma.walletBalanceSnapshot.findMany({
      where: { asOf: { gte: new Date(Date.now() - 36 * 3600 * 1000) } },
      orderBy: { asOf: 'desc' },
      include: { wallet: { select: { id: true, label: true, chain: true } } },
    }),
  ]);

  // 构造每个 (walletId, token) 最新一条快照
  const latestSnapPerKey = new Map<string, (typeof recentSnapshots)[number]>();
  for (const s of recentSnapshots) {
    const key = `${s.walletId}:${s.token}`;
    if (!latestSnapPerKey.has(key)) latestSnapPerKey.set(key, s);
  }
  const snapshotsByWallet = new Map<
    string,
    { wallet: { id: string; label: string; chain: string }; tokens: typeof recentSnapshots }
  >();
  for (const s of latestSnapPerKey.values()) {
    const k = s.walletId;
    if (!snapshotsByWallet.has(k)) {
      snapshotsByWallet.set(k, { wallet: s.wallet, tokens: [] });
    }
    snapshotsByWallet.get(k)!.tokens.push(s);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
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

      {/* KPI 三连 —— 移动端三列紧凑显示 */}
      <section className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
        <KpiCard label="待审凭证" value={pendingVouchersCount} accent="rose" />
        <KpiCard label="在用钱包" value={walletsCount} accent="amber" />
        <KpiCard label="近 30 天活动" value={monthActivityCount} accent="emerald" />
      </section>

      {/* 子页面快速入口 —— 5 张大卡片，移动端 2 列 / 桌面 5 列 */}
      <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 sm:gap-3">
        <SubPageCard
          href="/finance/dashboard"
          emoji="📊"
          label="财务总看板"
          hint="实时 KPI"
          accent="rose"
        />
        <SubPageCard
          href="/finance/vouchers"
          emoji="📒"
          label="凭证"
          hint="全部状态"
          accent="emerald"
        />
        <SubPageCard
          href="/finance/reports"
          emoji="📅"
          label="财务报告"
          hint="月 / 季 / 年 / 运营"
          accent="amber"
        />
        <SubPageCard
          href="/finance/fx-rates"
          emoji="📈"
          label="汇率"
          hint="MSO 偏离"
          accent="sky"
        />
        <SubPageCard
          href="/dept/cashier"
          emoji="🪙"
          label="出纳"
          hint="录入工作台"
          accent="violet"
        />
      </section>

      {/* Tabs */}
      <TabBar current={tab} pendingCount={pendingVouchersCount} />

      {/* Tab 内容 */}
      <div className="mt-5">
        {tab === 'overview' && (
          <OverviewTab
            pendingVouchers={pendingVouchers}
            wallets={wallets}
            bankAccounts={bankAccounts}
            isSuperAdmin={access.isSuperAdmin}
            canEdit={access.level === 'EDITOR'}
          />
        )}
        {tab === 'snapshots' && (
          <SnapshotsTab
            snapshotsByWallet={snapshotsByWallet}
            totalSnapshotCount={totalSnapshotCount}
            latestSnapshotMeta={latestSnapshotMeta}
          />
        )}
        {tab === 'activity' && <ActivityTab recentActivity={recentActivity} />}
      </div>

      {/* 财务部 AI 员工 API Key（仅 SUPER_ADMIN）—— FINANCE_* 是跨部门 scope，
         只有老板能发；非老板看不到这块卡片 */}
      {access.isSuperAdmin && (
        <DeptApiKeysCard
          deptName="财务部"
          scopePrefix="FINANCE_"
          scopeChoices={getScopeChoices('FINANCE_')}
          canManage={true}
          accent="rose"
        />
      )}

      {/* Footer */}
      {access.level === 'EDITOR' ? (
        <footer className="mt-10 rounded-xl border border-amber-200/60 bg-amber-50/40 p-4 text-xs text-amber-900">
          <div>
            💡 仅老板可见 · 授予/收回他人查看权限请去{' '}
            <Link href="/admin/finance/access" className="underline">
              管理 → 财务访问授权
            </Link>
            。
          </div>
          <details className="group mt-3 border-t border-amber-200/60 pt-3">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium text-amber-900 transition hover:bg-amber-100/40">
              <span>🛠 工具箱（3 项）</span>
              <span className="text-base opacity-60 transition group-open:rotate-180">▾</span>
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <VaultIngestButton />
              <CleanupTestsButton />
              <CleanupVaultTestsButton />
            </div>
          </details>
        </footer>
      ) : (
        <footer className="mt-10 rounded-xl border border-sky-200/60 bg-sky-50/40 p-4 text-xs text-sky-900">
          👁 你是只读账号。只能查看，不能修改。需要写权限请联系老板。
        </footer>
      )}
    </div>
  );
}

// ===== Tabs =====
function TabBar({ current, pendingCount }: { current: TabKey; pendingCount: number }) {
  const tabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: 'overview', label: '概览', badge: pendingCount },
    { key: 'snapshots', label: '余额快照' },
    { key: 'activity', label: 'AI 活动' },
  ];
  return (
    <nav
      role="tablist"
      aria-label="财务看板分区"
      className="-mx-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:rounded-xl sm:border sm:bg-white sm:px-1.5 sm:py-1"
    >
      {tabs.map((t) => {
        const active = current === t.key;
        const href = t.key === 'overview' ? '/finance' : `/finance?tab=${t.key}`;
        return (
          <Link
            key={t.key}
            href={href}
            role="tab"
            aria-selected={active}
            scroll={false}
            className={`relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition sm:rounded-lg sm:border-b-0 sm:py-1.5 ${
              active
                ? 'border-rose-500 text-rose-700 sm:bg-rose-50 sm:text-rose-800'
                : 'border-transparent text-slate-500 hover:text-slate-800 sm:hover:bg-slate-50'
            }`}
          >
            <span>{t.label}</span>
            {t.badge ? (
              <span
                className={`inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                  active ? 'bg-rose-600 text-white' : 'bg-rose-500 text-white'
                }`}
              >
                {t.badge > 99 ? '99+' : t.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

// ===== Tab: 概览（待审凭证 + 钱包/银行）=====
function OverviewTab({
  pendingVouchers,
  wallets,
  bankAccounts,
  isSuperAdmin,
  canEdit,
}: {
  pendingVouchers: Array<{
    id: string;
    date: Date;
    summary: string;
    debitAccount: string;
    creditAccount: string;
    amount: { toString(): string };
    currency: string;
    createdByAi: string | null;
    createdBy: { name: string | null } | null;
  }>;
  wallets: Array<{
    id: string;
    label: string;
    address: string;
    chain: string;
    holderType: string;
  }>;
  bankAccounts: Array<{
    id: string;
    label: string;
    bankName: string;
    accountNumber: string;
    currency: string;
  }>;
  canEdit: boolean;
  isSuperAdmin: boolean;
}) {
  return (
    <>
      {/* 待审凭证 */}
      <section className="mb-6">
        <SectionTitle>
          待审凭证（{pendingVouchers.length}）
          {pendingVouchers.length > 0 && (
            <span className="ml-2 text-xs font-normal text-rose-500">需要你点确认</span>
          )}
        </SectionTitle>
        {pendingVouchers.length === 0 ? (
          <EmptyHint text="无待审凭证 ✅" />
        ) : (
          <>
            {/* Mobile：卡片堆 —— 7 列表格在 375px 屏会横向溢出，卡片更易扫读 */}
            <ul className="space-y-2 md:hidden">
              {pendingVouchers.map((v) => (
                <li key={v.id} className="relative rounded-xl border border-slate-200 bg-white">
                  <Link
                    href={`/finance/vouchers/${v.id}`}
                    className="block p-3 transition active:bg-amber-50/40"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="min-w-0 flex-1 truncate pr-2 text-sm font-medium text-slate-800">
                        {v.summary}
                      </div>
                      <div className="shrink-0 font-mono text-sm font-semibold tabular-nums text-slate-900">
                        {v.amount.toString()}{' '}
                        <span className="text-xs font-normal text-slate-500">{v.currency}</span>
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-slate-500">
                      {/* 借/贷 长地址压缩，不然单行 truncate 把贷的钱包后缀"钱包"
                          这种关键 hint 给吃掉了，看不出来是 USDT 钱包还是银行户 */}
                      <span
                        className="truncate"
                        title={`${v.debitAccount} → ${v.creditAccount}`}
                      >
                        {shortenEthAddressesIn(v.debitAccount)} →{' '}
                        {shortenEthAddressesIn(v.creditAccount)}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {v.date.toISOString().slice(0, 10)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                      <span className="truncate">
                        {v.createdByAi ? `🤖 ${v.createdByAi}` : v.createdBy?.name ?? '人工'}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {isSuperAdmin && (
                          <VoucherDeleteButton voucherId={v.id} summary={v.summary} size="sm" />
                        )}
                        <span className="rounded-md bg-rose-600 px-2 py-0.5 text-[11px] font-medium text-white">
                          审核 →
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {/* Desktop：表格 ——
                之前问题：贷列里 AI 写的「其他货币资金-0x3cbDE679...749c钱包」用了
                whitespace-nowrap，autosize 把 200+ px 横向空间占走，剩下给摘要的
                空间不够，中文按字断行成"出 / 差 / 差 / 旅 / 报 / 销"。
                修法：
                1. 表格用 table-fixed + 显式列宽（colgroup），布局可预测
                2. 借/贷 长地址用 shortenEthAddressesIn() 压成 0x6 字符…4 字符
                3. 摘要用 break-words 自然换行（不再被挤成 4em 宽逐字断）
                4. 借/贷/摘要超出列宽 truncate + title attr 鼠标 hover 看完整
                5. 操作列内的"审核→"+删除按钮用 flex-wrap 防小屏挤爆 */}
            <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-[100px]" />{/* 日期 */}
                  <col />{/* 摘要 — 撑剩余空间 */}
                  <col className="w-[14%]" />{/* 借 */}
                  <col className="w-[18%]" />{/* 贷（含钱包名通常更长） */}
                  <col className="w-[120px]" />{/* 金额 */}
                  <col className="w-[110px]" />{/* 来源 */}
                  <col className="w-[140px]" />{/* 操作 */}
                </colgroup>
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">日期</th>
                    <th className="px-3 py-2 text-left">摘要</th>
                    <th className="px-3 py-2 text-left">借</th>
                    <th className="px-3 py-2 text-left">贷</th>
                    <th className="px-3 py-2 text-right">金额</th>
                    <th className="px-3 py-2 text-left">来源</th>
                    <th className="px-3 py-2 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingVouchers.map((v) => (
                    <tr
                      key={v.id}
                      className="border-t border-slate-100 transition hover:bg-amber-50/40"
                    >
                      <td className="px-3 py-2 align-top whitespace-nowrap text-xs text-slate-600">
                        <Link href={`/finance/vouchers/${v.id}`} className="block">
                          {v.date.toISOString().slice(0, 10)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 align-top text-slate-800">
                        <Link
                          href={`/finance/vouchers/${v.id}`}
                          className="block break-words leading-snug"
                          title={v.summary}
                        >
                          {v.summary}
                        </Link>
                      </td>
                      <td
                        className="truncate px-3 py-2 align-top text-xs text-slate-600"
                        title={v.debitAccount}
                      >
                        {shortenEthAddressesIn(v.debitAccount)}
                      </td>
                      <td
                        className="truncate px-3 py-2 align-top text-xs text-slate-600"
                        title={v.creditAccount}
                      >
                        {shortenEthAddressesIn(v.creditAccount)}
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap text-right font-medium tabular-nums text-slate-900">
                        {v.amount.toString()}{' '}
                        <span className="text-[10px] font-normal text-slate-500">{v.currency}</span>
                      </td>
                      <td
                        className="truncate px-3 py-2 align-top text-xs text-slate-500"
                        title={v.createdByAi ?? v.createdBy?.name ?? '人工'}
                      >
                        {v.createdByAi ? `🤖 ${v.createdByAi}` : v.createdBy?.name ?? '人工'}
                      </td>
                      <td className="px-3 py-2 align-top text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          {isSuperAdmin && (
                            <VoucherDeleteButton voucherId={v.id} summary={v.summary} size="sm" />
                          )}
                          <Link
                            href={`/finance/vouchers/${v.id}`}
                            className="inline-flex items-center whitespace-nowrap rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition hover:bg-rose-700"
                          >
                            审核 →
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* 添加 / 去重 工具栏（EDITOR 看到加按钮，SUPER_ADMIN 多看到去重按钮） */}
      <AddWalletBankBar canEdit={canEdit} isSuperAdmin={isSuperAdmin} />

      {/* 钱包 / 银行 双栏 */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <SectionTitle>钱包总览（{wallets.length}）</SectionTitle>
          {wallets.length === 0 ? (
            <EmptyHint text="未登记钱包。" />
          ) : (
            <ul className="space-y-2">
              {wallets.map((w) => (
                <li key={w.id}>
                  <Link
                    href={`/finance/wallets/${w.id}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-amber-300 hover:bg-amber-50/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-800">{w.label}</div>
                      <div className="font-mono text-xs text-slate-500">
                        {w.address.slice(0, 6)}…{w.address.slice(-4)}{' '}
                        <span className="text-slate-400">· {w.chain}</span>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 ring-1 ring-amber-200">
                      {holderTypeLabel(w.holderType)}
                    </span>
                  </Link>
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
                <li key={b.id}>
                  <Link
                    href={`/finance/bank-accounts/${b.id}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-sky-300 hover:bg-sky-50/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-800">{b.label}</div>
                      <div className="text-xs text-slate-500">
                        {b.bankName} · {b.accountNumber.slice(0, 4)}…{b.accountNumber.slice(-4)}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700 ring-1 ring-sky-200">
                      {b.currency}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

// ===== Tab: 余额快照 =====
function SnapshotsTab({
  snapshotsByWallet,
  totalSnapshotCount,
  latestSnapshotMeta,
}: {
  snapshotsByWallet: Map<
    string,
    {
      wallet: { id: string; label: string; chain: string };
      tokens: Array<{ token: string; amount: { toString(): string }; asOf: Date }>;
    }
  >;
  totalSnapshotCount: number;
  latestSnapshotMeta: { asOf: Date } | null;
}) {
  return (
    <section>
      <SectionTitle>
        钱包余额快照
        {latestSnapshotMeta && (
          <span className="ml-2 text-xs font-normal text-slate-400">
            · 共 {totalSnapshotCount} 条 · 最近 {formatTime(latestSnapshotMeta.asOf)}
          </span>
        )}
      </SectionTitle>
      {snapshotsByWallet.size === 0 ? (
        <EmptyHint
          text={
            totalSnapshotCount === 0
              ? '暂无快照。Cron 每天 UTC 00:00（HK 8:00）自动跑，跑完会出现在这里。'
              : '过去 36h 没新快照 —— cron 可能没正常跑，去 Vercel 查 Function Logs。'
          }
        />
      ) : (
        <ul className="space-y-2">
          {Array.from(snapshotsByWallet.values()).map(({ wallet, tokens }) => (
            <li
              key={wallet.id}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <Link
                  href={`/finance/wallets/${wallet.id}`}
                  className="min-w-0 truncate text-sm font-medium text-slate-800 hover:text-amber-700"
                >
                  {wallet.label}
                </Link>
                <span className="shrink-0 text-xs text-slate-400">
                  {wallet.chain} · {formatTime(tokens[0].asOf)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                {tokens.map((t) => (
                  <div
                    key={t.token}
                    className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100"
                  >
                    <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                      {t.token}
                    </div>
                    <div className="mt-0.5 font-mono tabular-nums text-slate-900">
                      {t.amount.toString()}
                    </div>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ===== Tab: AI 活动流 =====
function ActivityTab({
  recentActivity,
}: {
  recentActivity: Array<{
    id: string;
    aiRole: string;
    action: string;
    errorMessage: string | null;
    telegramSent: boolean;
    vaultWritten: boolean;
    dashboardWritten: boolean;
    createdAt: Date;
  }>;
}) {
  return (
    <section>
      <SectionTitle>AI 活动流（最近 {recentActivity.length} 条）</SectionTitle>
      {recentActivity.length === 0 ? (
        <EmptyHint text="暂无 AI 活动。等 5 个 AI 开始干活就会出现在这里。" />
      ) : (
        <ul className="divide-y divide-slate-200/60 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {recentActivity.map((log) => (
            <li
              key={log.id}
              className="flex flex-col gap-1.5 px-3 py-2.5 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:px-4"
            >
              <div className="flex min-w-0 flex-wrap items-baseline gap-2">
                <RoleBadge role={log.aiRole} />
                <span className="min-w-0 break-words text-slate-700 sm:truncate">
                  {log.action}
                </span>
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
  );
}

// ===== helpers =====
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
      {children}
    </h2>
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
}: {
  label: string;
  value: number;
  accent: 'rose' | 'amber' | 'emerald';
}) {
  const accentMap = {
    rose: 'from-rose-50 to-rose-100/40 ring-rose-200/60 text-rose-700',
    amber: 'from-amber-50 to-amber-100/40 ring-amber-200/60 text-amber-700',
    emerald: 'from-emerald-50 to-emerald-100/40 ring-emerald-200/60 text-emerald-700',
  } as const;
  return (
    <div className={`rounded-xl bg-gradient-to-br p-3 ring-1 sm:p-4 ${accentMap[accent]}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider opacity-80 sm:text-xs">
        {label}
      </div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums sm:mt-1 sm:text-3xl">{value}</div>
    </div>
  );
}

/** /finance 主页 → 各子页面的快速入口卡片 */
function SubPageCard({
  href,
  emoji,
  label,
  hint,
  accent,
}: {
  href: string;
  emoji: string;
  label: string;
  hint?: string;
  accent: 'rose' | 'amber' | 'sky' | 'violet' | 'emerald';
}) {
  const map = {
    rose: 'border-rose-200/60 hover:border-rose-300 hover:bg-rose-50/40',
    amber: 'border-amber-200/60 hover:border-amber-300 hover:bg-amber-50/40',
    sky: 'border-sky-200/60 hover:border-sky-300 hover:bg-sky-50/40',
    violet: 'border-violet-200/60 hover:border-violet-300 hover:bg-violet-50/40',
    emerald: 'border-emerald-200/60 hover:border-emerald-300 hover:bg-emerald-50/40',
  } as const;
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center rounded-xl border bg-white px-3 py-4 text-center transition ${map[accent]}`}
    >
      <span className="text-2xl">{emoji}</span>
      <span className="mt-1.5 text-sm font-medium text-slate-800">{label}</span>
      {hint && <span className="mt-0.5 text-[11px] text-slate-500">{hint}</span>}
    </Link>
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
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${m.cls}`}
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

