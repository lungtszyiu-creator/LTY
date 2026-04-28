/**
 * 凭证详情页 /finance/vouchers/[id]
 *
 * 老板审核 AI 生成凭证的 UI 入口。EDITOR 看到 Approve/Reject/Void 按钮，
 * VIEWER 只读。
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireFinanceView } from '@/lib/finance-access';
import { VoucherActions } from './voucher-actions';

export const dynamic = 'force-dynamic';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  AI_DRAFT: { label: 'AI 草稿', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  BOSS_REVIEWING: { label: '老板审核中', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  POSTED: { label: '已过账', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  REJECTED: { label: '已驳回', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
  VOIDED: { label: '已作废', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

export default async function VoucherDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await requireFinanceView();
  const { id } = await params;

  const voucher = await prisma.voucher.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      postedBy: { select: { id: true, name: true, email: true } },
      approvalInstance: { select: { id: true, status: true, title: true } },
    },
  });

  if (!voucher) notFound();

  const meta = STATUS_META[voucher.status] ?? {
    label: voucher.status,
    cls: 'bg-slate-100 text-slate-600 ring-slate-200',
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* 顶部 */}
      <div className="mb-6 flex items-baseline justify-between">
        <Link
          href="/finance"
          className="text-sm text-slate-500 transition hover:text-slate-800"
        >
          ← 返回财务总览
        </Link>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${meta.cls}`}
        >
          {meta.label}
        </span>
      </div>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">{voucher.summary}</h1>
        <div className="mt-1 flex items-baseline gap-3 text-sm text-slate-500">
          <span className="font-mono">{voucher.voucherNumber ?? '凭证号未分配'}</span>
          <span>·</span>
          <span>{voucher.date.toISOString().slice(0, 10)}</span>
        </div>
      </header>

      {/* 借贷方块 */}
      <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DebitCreditCard label="借方" account={voucher.debitAccount} amount={voucher.amount.toString()} currency={voucher.currency} accent="rose" />
        <DebitCreditCard label="贷方" account={voucher.creditAccount} amount={voucher.amount.toString()} currency={voucher.currency} accent="emerald" />
      </section>

      {/* 核心字段表 */}
      <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <dl className="divide-y divide-slate-200/60">
          <Row label="日期">{voucher.date.toISOString().slice(0, 10)}</Row>
          <Row label="摘要">{voucher.summary}</Row>
          <Row label="借方科目"><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{voucher.debitAccount}</code></Row>
          <Row label="贷方科目"><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{voucher.creditAccount}</code></Row>
          <Row label="金额">
            <span className="font-mono tabular-nums text-base font-semibold">
              {voucher.amount.toString()} {voucher.currency}
            </span>
          </Row>
          {voucher.notes && (
            <Row label="备注">
              <pre className="whitespace-pre-wrap font-sans text-sm text-slate-600">{voucher.notes}</pre>
            </Row>
          )}
          {voucher.vaultPath && (
            <Row label="Vault 路径">
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{voucher.vaultPath}</code>
            </Row>
          )}
          {voucher.relatedTxIds && (
            <Row label="关联链上交易"><code className="text-xs">{voucher.relatedTxIds}</code></Row>
          )}
          {voucher.approvalInstance && (
            <Row label="关联审批">
              <Link href={`/approvals/${voucher.approvalInstance.id}`} className="text-blue-600 underline">
                {voucher.approvalInstance.title} ({voucher.approvalInstance.status})
              </Link>
            </Row>
          )}
        </dl>
      </section>

      {/* 审计信息 */}
      <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AuditCard
          title="创建"
          who={voucher.createdByAi ? `🤖 ${voucher.createdByAi}` : voucher.createdBy?.name ?? '人工'}
          when={voucher.createdAt}
        />
        {voucher.postedAt && (
          <AuditCard
            title="过账（批准人）"
            who={voucher.postedBy?.name ?? '系统'}
            when={voucher.postedAt}
          />
        )}
      </section>

      {/* 老板操作区（VIEWER 看不到） */}
      {access.level === 'EDITOR' && (
        <section className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-600">
            老板操作
          </h2>
          <VoucherActions voucherId={voucher.id} status={voucher.status as never} />
        </section>
      )}
      {access.level === 'VIEWER' && (
        <div className="rounded-xl border border-sky-200/60 bg-sky-50/40 p-4 text-xs text-sky-900">
          👁 你是只读账号，无法审批。
        </div>
      )}
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

function DebitCreditCard({
  label,
  account,
  amount,
  currency,
  accent,
}: {
  label: string;
  account: string;
  amount: string;
  currency: string;
  accent: 'rose' | 'emerald';
}) {
  const cls =
    accent === 'rose'
      ? 'from-rose-50 to-rose-100/40 ring-rose-200/60 text-rose-800'
      : 'from-emerald-50 to-emerald-100/40 ring-emerald-200/60 text-emerald-800';
  return (
    <div className={`rounded-xl bg-gradient-to-br p-4 ring-1 ${cls}`}>
      <div className="text-xs font-medium uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{account}</div>
      <div className="mt-2 font-mono tabular-nums text-xl font-semibold">
        {amount} <span className="text-sm">{currency}</span>
      </div>
    </div>
  );
}

function AuditCard({ title, who, when }: { title: string; who: string; when: Date }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{title}</div>
      <div className="mt-1 text-sm font-medium text-slate-800">{who}</div>
      <div className="mt-0.5 text-xs text-slate-400">{when.toISOString().slice(0, 16).replace('T', ' ')}</div>
    </div>
  );
}
