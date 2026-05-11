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
import { EditVoucherCard } from './EditVoucherCard';

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

  // 拉 audit log 时间线（按创建时间倒序）
  const auditLogs = await prisma.voucherAuditLog.findMany({
    where: { voucherId: id },
    orderBy: { createdAt: 'desc' },
    include: { changedBy: { select: { name: true, email: true } } },
  });

  const meta = STATUS_META[voucher.status] ?? {
    label: voucher.status,
    cls: 'bg-slate-100 text-slate-600 ring-slate-200',
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
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

      {/* 用途/扣自方块 — 原会计「借/贷方」改成老板看得懂的「用途 (借)/扣自 (贷)」 */}
      <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DebitCreditCard label="用途 (借)" account={voucher.debitAccount} amount={voucher.amount.toString()} currency={voucher.currency} accent="rose" />
        <DebitCreditCard label="扣自 (贷)" account={voucher.creditAccount} amount={voucher.amount.toString()} currency={voucher.currency} accent="emerald" />
      </section>

      {/* 核心字段表 */}
      <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <dl className="divide-y divide-slate-200/60">
          <Row label="日期">{voucher.date.toISOString().slice(0, 10)}</Row>
          <Row label="摘要">{voucher.summary}</Row>
          <Row label="用途科目 (借方)"><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{voucher.debitAccount}</code></Row>
          <Row label="扣自科目 (贷方)"><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{voucher.creditAccount}</code></Row>
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

      {/* 修改字段区（EDITOR 和 VIEWER 都能用；AI_DRAFT / BOSS_REVIEWING 状态下显示）*/}
      {(voucher.status === 'AI_DRAFT' || voucher.status === 'BOSS_REVIEWING') && (
        <section className="mb-4">
          <EditVoucherCard
            initial={{
              id: voucher.id,
              date: voucher.date.toISOString().slice(0, 10),
              summary: voucher.summary,
              debitAccount: voucher.debitAccount,
              creditAccount: voucher.creditAccount,
              amount: voucher.amount.toString(),
              currency: voucher.currency,
              notes: voucher.notes,
              relatedTxIdsArr: (() => {
                if (!voucher.relatedTxIds) return [];
                try {
                  const parsed = JSON.parse(voucher.relatedTxIds);
                  return Array.isArray(parsed) ? parsed.map(String) : [];
                } catch {
                  return [];
                }
              })(),
            }}
            viewerHint={access.level === 'VIEWER'}
          />
        </section>
      )}

      {/* 老板操作区（仅 EDITOR）—— 批准 / 驳回 / 作废 */}
      {access.level === 'EDITOR' && (
        <section className="mb-6 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-600">
            老板操作
          </h2>
          <VoucherActions
            voucherId={voucher.id}
            status={voucher.status as never}
            isSuperAdmin={access.isSuperAdmin}
          />
        </section>
      )}

      {access.level === 'VIEWER' && (
        <div className="mb-6 rounded-xl border border-sky-200/60 bg-sky-50/40 p-4 text-xs text-sky-900">
          出纳可改 AI 草稿凭证（每次留痕给老板审），但批准/驳回/作废只能老板做。
        </div>
      )}

      {/* 操作时间线 */}
      <AuditTimeline
        logs={auditLogs.map((l) => ({
          id: l.id,
          action: l.action,
          who: l.changedBy?.name ?? l.changedBy?.email ?? (l.byAi ? `AI · ${l.byAi}` : '系统'),
          when: l.createdAt,
          reason: l.reason,
          before: l.beforeJson,
          after: l.afterJson,
        }))}
      />
    </div>
  );
}

function AuditTimeline({
  logs,
}: {
  logs: Array<{
    id: string;
    action: string;
    who: string;
    when: Date;
    reason: string | null;
    before: string | null;
    after: string | null;
  }>;
}) {
  if (logs.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
          操作时间线
        </h2>
        <div className="text-xs text-slate-400">本凭证尚无操作记录（schema 升级前的凭证不显示历史）</div>
      </section>
    );
  }
  const ACTION_META: Record<string, { label: string; cls: string }> = {
    create: { label: '创建', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
    edit: { label: '修改', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
    approve: { label: '批准', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    reject: { label: '驳回', cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
    void: { label: '作废', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
    delete: { label: '删除', cls: 'bg-rose-100 text-rose-800 ring-rose-300' },
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
        操作时间线（共 {logs.length} 条）
      </h2>
      <ul className="space-y-3">
        {logs.map((l) => {
          const meta = ACTION_META[l.action] ?? {
            label: l.action,
            cls: 'bg-slate-50 text-slate-600 ring-slate-200',
          };
          const beforeObj = l.before ? safeParseJson(l.before) : null;
          const afterObj = l.after ? safeParseJson(l.after) : null;
          return (
            <li key={l.id} className="border-l-2 border-slate-200 pl-3">
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${meta.cls}`}>
                    {meta.label}
                  </span>
                  <span className="text-sm font-medium text-slate-800">{l.who}</span>
                </div>
                <time className="text-[11px] text-slate-400 tabular-nums">
                  {l.when.toISOString().slice(0, 16).replace('T', ' ')}
                </time>
              </div>
              {l.reason && (
                <div className="mt-1 text-xs text-slate-600">
                  <span className="text-slate-400">理由：</span>
                  {l.reason}
                </div>
              )}
              {beforeObj !== null && afterObj !== null ? (
                <div className="mt-1.5 grid grid-cols-1 gap-1 rounded-lg bg-slate-50/60 p-2 text-[11px] sm:grid-cols-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">变更前</div>
                    <pre className="mt-0.5 whitespace-pre-wrap break-all font-mono text-rose-700/80">
                      {JSON.stringify(beforeObj, null, 0)}
                    </pre>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">变更后</div>
                    <pre className="mt-0.5 whitespace-pre-wrap break-all font-mono text-emerald-700/80">
                      {JSON.stringify(afterObj, null, 0)}
                    </pre>
                  </div>
                </div>
              ) : null}
              {beforeObj === null && afterObj !== null ? (
                <div className="mt-1.5 rounded-lg bg-slate-50/60 p-2 text-[11px]">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">初始值</div>
                  <pre className="mt-0.5 whitespace-pre-wrap break-all font-mono text-slate-700">
                    {JSON.stringify(afterObj, null, 0)}
                  </pre>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
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
