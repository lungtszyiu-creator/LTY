/**
 * 银行账户详情页 /finance/bank-accounts/[id]
 *
 * 全文账号 + 一键复制
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireFinanceView } from '@/lib/finance-access';
import { CopyButton } from '../../copy-button';
import { VaultSyncBadge } from '@/components/vault-sync-badge';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  BASIC: '基本户',
  CAPITAL: '资本户',
  GENERAL: '一般户',
  PAYROLL: '工资户',
  FX: '外汇户',
};

export default async function BankAccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireFinanceView();
  const { id } = await params;

  const account = await prisma.bankAccount.findUnique({
    where: { id },
    include: {
      department: { select: { id: true, name: true } },
    },
  });
  if (!account) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-baseline justify-between">
        <Link href="/finance" className="text-sm text-slate-500 transition hover:text-slate-800">
          ← 返回财务总览
        </Link>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${
            account.isActive
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              : 'bg-slate-100 text-slate-500 ring-slate-200'
          }`}
        >
          {account.isActive ? '在用' : '停用'}
        </span>
      </div>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">{account.label}</h1>
        <div className="mt-1 flex items-baseline gap-3 text-sm text-slate-500">
          <span>{account.bankName}</span>
          <span>·</span>
          <span>{TYPE_LABEL[account.accountType] ?? account.accountType}</span>
          <span>·</span>
          <span>{account.currency}</span>
        </div>
      </header>

      {/* 账号（全文 + 复制按钮） */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-500">账号</div>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900">
            {account.accountNumber}
          </code>
          <CopyButton text={account.accountNumber} label="复制账号" />
        </div>
      </section>

      {/* 字段表 */}
      <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <dl className="divide-y divide-slate-200/60">
          <Row label="开户行">{account.bankName}</Row>
          <Row label="账户类型">{TYPE_LABEL[account.accountType] ?? account.accountType}</Row>
          <Row label="币种">{account.currency}</Row>
          {account.department && <Row label="部门">{account.department.name}</Row>}
          {account.notes && (
            <Row label="备注">
              <pre className="whitespace-pre-wrap font-sans text-sm text-slate-600">{account.notes}</pre>
            </Row>
          )}
          <Row label="Vault 同步">
            <VaultSyncBadge vaultPath={account.vaultPath} />
          </Row>
          <Row label="创建时间">{account.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</Row>
          <Row label="更新时间">{account.updatedAt.toISOString().slice(0, 16).replace('T', ' ')}</Row>
        </dl>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  // Mobile：label 顶部小字 + value 占满宽度，避开 140px 固定列在窄屏挤压；sm 以上回到双列对齐
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 text-sm sm:grid sm:grid-cols-[140px_1fr] sm:gap-4">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-500 sm:text-sm sm:normal-case sm:tracking-normal">
        {label}
      </dt>
      <dd className="min-w-0 text-slate-900">{children}</dd>
    </div>
  );
}
