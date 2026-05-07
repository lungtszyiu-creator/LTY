import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireDeptView } from '@/lib/dept-access';
import {
  CASHIER_REIMB_CATEGORY_LABEL,
  CASHIER_REIMB_STATUS_META,
  formatMoney,
} from '@/lib/cashier-shared';
import { ConfirmDeleteForm } from '@/app/dept/admin/_components/ConfirmDeleteForm';
import {
  approveReimbursement,
  rejectReimbursement,
  markReimbPaid,
  deleteReimbursement,
} from '../../_actions';

export const dynamic = 'force-dynamic';

export default async function ReimbursementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireDeptView('cashier');
  const r = await prisma.cashierReimbursement.findUnique({
    where: { id },
    include: {
      applicant: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!r) notFound();

  const sm = CASHIER_REIMB_STATUS_META[r.status] ?? CASHIER_REIMB_STATUS_META.PENDING;
  const canEdit = ctx.level === 'LEAD' || ctx.isSuperAdmin;
  const canDelete = ctx.isSuperAdmin;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold text-slate-900">{r.title}</h1>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${sm.cls}`}>
            {sm.label}
          </span>
        </div>
        <Link href="/dept/cashier?tab=expense" className="text-xs text-slate-500 hover:underline">← 返回</Link>
      </header>

      <section className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <Row label="类型" value={CASHIER_REIMB_CATEGORY_LABEL[r.category] ?? r.category} />
        <Row label="部门" value={r.department ?? '—'} />
        <Row label="金额" value={`${r.currency} ${formatMoney(r.amount)}`} bold />
        <Row label="费用日期" value={r.occurredOn?.toISOString().slice(0, 10) ?? '—'} />
        <Row label="申请人" value={r.applicant.name ?? r.applicant.email} />
        <Row
          label="审批"
          value={
            r.approvedBy
              ? `${r.approvedBy.name ?? r.approvedBy.email}${r.approvedAt ? ` · ${r.approvedAt.toISOString().slice(0, 10)}` : ''}`
              : '—'
          }
        />
        <Row label="付款日" value={r.paidAt?.toISOString().slice(0, 10) ?? '—'} />
      </section>

      {r.reason && (
        <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">事由</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{r.reason}</p>
        </section>
      )}
      {r.rejectReason && (
        <section className="mb-4 rounded-xl border border-rose-200 bg-rose-50/40 p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-rose-700">拒绝原因</h2>
          <p className="whitespace-pre-wrap text-sm text-rose-900">{r.rejectReason}</p>
        </section>
      )}
      {r.notes && (
        <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">备注</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{r.notes}</p>
        </section>
      )}

      {canEdit && (
        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          {r.status === 'PENDING' && (
            <>
              <form
                action={async () => {
                  'use server';
                  await approveReimbursement(r.id);
                }}
              >
                <button type="submit" className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                  ✓ 批准
                </button>
              </form>
              <form
                action={async (formData: FormData) => {
                  'use server';
                  await rejectReimbursement(r.id, formData);
                }}
                className="flex gap-2"
              >
                <input name="rejectReason" placeholder="拒绝原因" className="flex-1 rounded-lg border border-rose-300 px-2 py-1.5 text-xs" />
                <button type="submit" className="rounded-lg bg-rose-600 px-3 text-xs font-medium text-white hover:bg-rose-700">
                  拒绝
                </button>
              </form>
            </>
          )}
          {r.status === 'APPROVED' && (
            <form
              action={async () => {
                'use server';
                await markReimbPaid(r.id);
              }}
            >
              <button type="submit" className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white hover:bg-sky-700">
                💸 标记付款
              </button>
            </form>
          )}
          {canDelete && (
            <ConfirmDeleteForm
              action={async () => {
                'use server';
                await deleteReimbursement(r.id);
              }}
              message="永久删除此报销记录？此操作不可逆。"
            >
              <button
                type="submit"
                className="w-full rounded-lg bg-rose-600 py-2 text-sm font-medium text-white hover:bg-rose-700"
              >
                永久删除（总管）
              </button>
            </ConfirmDeleteForm>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-0.5 text-sm text-slate-700 ${bold ? 'font-semibold' : ''}`}>{value}</div>
    </div>
  );
}
