/**
 * 钱包详情页 /finance/wallets/[id]
 *
 * 全文地址 + 一键复制 + 关联交易（最近 20 笔）
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireFinanceView } from '@/lib/finance-access';
import { CopyButton } from '../../copy-button';
import { AutoMonitorToggle } from './auto-monitor-toggle';

export const dynamic = 'force-dynamic';

const HOLDER_LABEL: Record<string, string> = {
  BOSS: '老板',
  COMPANY_CASHIER: '公司出纳',
  EMPLOYEE: '员工',
  TREASURY: '储备',
  EXTERNAL: '外部',
};

export default async function WalletDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await requireFinanceView();
  const { id } = await params;

  const wallet = await prisma.cryptoWallet.findUnique({
    where: { id },
    include: {
      holderUser: { select: { id: true, name: true, email: true } },
      department: { select: { id: true, name: true } },
    },
  });
  if (!wallet) notFound();

  const recentTxs = await prisma.chainTransaction.findMany({
    where: {
      OR: [{ fromWalletId: wallet.id }, { toWalletId: wallet.id }],
    },
    take: 20,
    orderBy: { timestamp: 'desc' },
    select: {
      id: true,
      txHash: true,
      timestamp: true,
      fromAddress: true,
      toAddress: true,
      amount: true,
      token: true,
      tag: true,
    },
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-baseline justify-between">
        <Link href="/finance" className="text-sm text-slate-500 transition hover:text-slate-800">
          ← 返回财务总览
        </Link>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${
            wallet.isActive
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              : 'bg-slate-100 text-slate-500 ring-slate-200'
          }`}
        >
          {wallet.isActive ? '在用' : '停用'}
        </span>
      </div>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">{wallet.label}</h1>
        <div className="mt-1 flex items-baseline gap-3 text-sm text-slate-500">
          <span>{wallet.chain}</span>
          <span>·</span>
          <span>{HOLDER_LABEL[wallet.holderType] ?? wallet.holderType}</span>
        </div>
      </header>

      {/* 地址（全文 + 复制按钮） */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-500">钱包地址</div>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900">
            {wallet.address}
          </code>
          <CopyButton text={wallet.address} label="复制地址" />
        </div>
      </section>

      {/* 自动监控开关（仅 EDITOR 可改，VIEWER 只读显示） */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          Cron 自动监控
        </div>
        {access.level === 'EDITOR' ? (
          <AutoMonitorToggle walletId={wallet.id} initial={wallet.autoMonitor} />
        ) : (
          <div className="text-sm text-slate-700">
            <span
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium ${
                wallet.autoMonitor
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                  : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${wallet.autoMonitor ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              {wallet.autoMonitor ? '已开启' : '已关闭'}
            </span>
          </div>
        )}
      </section>

      {/* 字段表 */}
      <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <dl className="divide-y divide-slate-200/60">
          <Row label="链">{wallet.chain}</Row>
          <Row label="持有人类型">{HOLDER_LABEL[wallet.holderType] ?? wallet.holderType}</Row>
          {wallet.holderUser && (
            <Row label="关联员工">
              {wallet.holderUser.name ?? wallet.holderUser.email}
            </Row>
          )}
          {wallet.department && <Row label="部门">{wallet.department.name}</Row>}
          {wallet.purpose && <Row label="用途">{wallet.purpose}</Row>}
          {wallet.notes && (
            <Row label="备注">
              <pre className="whitespace-pre-wrap font-sans text-sm text-slate-600">{wallet.notes}</pre>
            </Row>
          )}
          {wallet.vaultPath && (
            <Row label="Vault 路径">
              <code className="break-all rounded bg-slate-100 px-1.5 py-0.5 text-xs">{wallet.vaultPath}</code>
            </Row>
          )}
          <Row label="创建时间">{wallet.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</Row>
          <Row label="更新时间">{wallet.updatedAt.toISOString().slice(0, 16).replace('T', ' ')}</Row>
        </dl>
      </section>

      {/* 最近交易 */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
          最近 20 笔链上交易
        </h2>
        {recentTxs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-sm text-slate-400">
            尚无关联交易记录。链上记账员开始干活就会出现在这里。
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">时间</th>
                  <th className="px-4 py-2 text-left">方向</th>
                  <th className="px-4 py-2 text-left">对手</th>
                  <th className="px-4 py-2 text-right">金额</th>
                  <th className="px-4 py-2 text-left">标签</th>
                </tr>
              </thead>
              <tbody>
                {recentTxs.map((tx) => {
                  const isFrom = tx.fromAddress === wallet.address;
                  const counterparty = isFrom ? tx.toAddress : tx.fromAddress;
                  return (
                    <tr key={tx.id} className="border-t border-slate-100">
                      <td className="px-4 py-2 whitespace-nowrap text-slate-600">
                        {tx.timestamp.toISOString().slice(0, 16).replace('T', ' ')}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-slate-600">
                        {isFrom ? '↗ 出账' : '↘ 入账'}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">
                        {counterparty.slice(0, 8)}…{counterparty.slice(-6)}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-right font-medium tabular-nums">
                        {tx.amount.toString()} {tx.token}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-500">{tx.tag ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-4 px-4 py-3 text-sm">
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="text-slate-900">{children}</dd>
    </div>
  );
}
