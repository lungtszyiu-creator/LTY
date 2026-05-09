/**
 * 报销 Tab —— 列表 + "+ 发起申请"按钮
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';
import {
  CASHIER_REIMB_CATEGORY_LABEL,
  CASHIER_REIMB_STATUS_META,
  formatMoney,
} from '@/lib/cashier-shared';

export async function ReimbursementsTab({ canEdit }: { canEdit: boolean }) {
  void canEdit;
  const reimbs = await prisma.cashierReimbursement.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 100,
    include: { applicant: { select: { name: true, email: true } } },
  });

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          报销申请（{reimbs.length}）
        </h2>
        <Link
          href="/dept/cashier/reimbursements/new"
          className="inline-flex items-center rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-rose-700"
        >
          + 发起申请
        </Link>
      </div>

      {/* 报销指南 —— 小/中/大额阈值（数字来源 manus 出纳看板报销页指南卡片） */}
      <details className="mb-3 rounded-xl border border-slate-200 bg-white p-3 text-xs">
        <summary className="cursor-pointer font-medium text-slate-700">
          📘 报销指南 · 额度 / 审批路径 / 预计时长
        </summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2">
            <div className="mb-1 text-[11px] font-semibold text-emerald-800">小额</div>
            <div className="text-[11px] text-emerald-900">≤HK$2,000 / ≤RMB1,500 / ≤USD$255</div>
            <div className="mt-1 text-[10px] text-slate-600">员工 → 部门负责人 → 财务负责人 → 打款（3-4 工作日）</div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-2">
            <div className="mb-1 text-[11px] font-semibold text-amber-800">中额</div>
            <div className="text-[11px] text-amber-900">HK$2,001-20,000 / RMB1,501-15,000</div>
            <div className="mt-1 text-[10px] text-slate-600">+ 董事 / 董事长（5-7 工作日）</div>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-2">
            <div className="mb-1 text-[11px] font-semibold text-rose-800">大额</div>
            <div className="text-[11px] text-rose-900">{'>'}HK$20,000 / {'>'}RMB15,000 / {'>'}USD$255</div>
            <div className="mt-1 text-[10px] text-slate-600">须附合同 + 发票（7-10 工作日）</div>
          </div>
        </div>
      </details>

      {reimbs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center text-sm text-slate-400">
          暂无报销记录
        </div>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {reimbs.map((r) => {
              const sm = CASHIER_REIMB_STATUS_META[r.status] ?? CASHIER_REIMB_STATUS_META.PENDING;
              return (
                <li key={r.id}>
                  <Link
                    href={`/dept/cashier/reimbursements/${r.id}`}
                    className="block rounded-xl border border-slate-200 bg-white p-3 transition active:bg-rose-50/40"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{r.title}</div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ring-1 ${sm.cls}`}>
                        {sm.label}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>{CASHIER_REIMB_CATEGORY_LABEL[r.category] ?? r.category}</span>
                      <span className="font-semibold tabular-nums text-slate-700">
                        {r.currency} {formatMoney(r.amount)}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {r.applicant.name ?? r.applicant.email}
                      {r.department && <span className="ml-1 text-slate-400">· {r.department}</span>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[120px]" />{/* 申请人 */}
                <col className="w-[100px]" />{/* 类型 */}
                <col />{/* 标题 — 撑剩余 */}
                <col className="w-[140px]" />{/* 金额 */}
                <col className="w-[100px]" />{/* 部门 */}
                <col className="w-[110px]" />{/* 费用日期 */}
                <col className="w-[80px]" />{/* 状态 */}
              </colgroup>
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">申请人</th>
                  <th className="px-3 py-2 text-left">类型</th>
                  <th className="px-3 py-2 text-left">标题</th>
                  <th className="px-3 py-2 text-left">金额</th>
                  <th className="px-3 py-2 text-left">部门</th>
                  <th className="px-3 py-2 text-left">费用日期</th>
                  <th className="px-3 py-2 text-left">状态</th>
                </tr>
              </thead>
              <tbody>
                {reimbs.map((r) => {
                  const sm = CASHIER_REIMB_STATUS_META[r.status] ?? CASHIER_REIMB_STATUS_META.PENDING;
                  return (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-rose-50/40">
                      <td
                        className="truncate px-3 py-2 align-top text-xs text-slate-600"
                        title={r.applicant.name ?? r.applicant.email ?? undefined}
                      >
                        {r.applicant.name ?? r.applicant.email}
                      </td>
                      <td className="truncate px-3 py-2 align-top text-xs text-slate-600">
                        {CASHIER_REIMB_CATEGORY_LABEL[r.category] ?? r.category}
                      </td>
                      <td className="px-3 py-2 align-top text-slate-800">
                        <Link
                          href={`/dept/cashier/reimbursements/${r.id}`}
                          className="block break-words leading-snug"
                          title={r.title}
                        >
                          {r.title}
                        </Link>
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap font-semibold tabular-nums text-slate-700">
                        {r.currency} {formatMoney(r.amount)}
                      </td>
                      <td className="truncate px-3 py-2 align-top text-xs text-slate-600" title={r.department ?? undefined}>
                        {r.department ?? '—'}
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap text-xs text-slate-500 tabular-nums">
                        {r.occurredOn?.toISOString().slice(0, 10) ?? '—'}
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap">
                        <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${sm.cls}`}>
                          {sm.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
