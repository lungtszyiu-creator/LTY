/**
 * 对账 Tab —— 任务卡片 + 标记完成
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';
import {
  CASHIER_RECON_TYPE_LABEL,
  CASHIER_RECON_STATUS_META,
  CASHIER_CYCLE_LABEL,
  daysUntil,
} from '@/lib/cashier-shared';
import { markReconDone } from '../_actions';

export async function ReconciliationsTab({ canEdit }: { canEdit: boolean }) {
  const tasks = await prisma.cashierReconciliationTask.findMany({
    orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
    take: 100,
    include: { owner: { select: { name: true, email: true } } },
  });

  const overdueCount = tasks.filter(
    (t) => t.status !== 'DONE' && t.dueAt.getTime() < Date.now(),
  ).length;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          对账任务池（共 {tasks.length}
          {overdueCount > 0 && <span className="text-rose-600"> · {overdueCount} 个逾期</span>}）
        </h2>
        <Link
          href="/dept/cashier/reconciliations/new"
          className="inline-flex items-center rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-rose-700"
        >
          + 新增任务
        </Link>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center text-sm text-slate-400">
          暂无对账任务
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((t) => {
            const sm = CASHIER_RECON_STATUS_META[t.status] ?? CASHIER_RECON_STATUS_META.OPEN;
            const dl = daysUntil(t.dueAt);
            const overdue = dl !== null && dl < 0 && t.status !== 'DONE';
            return (
              <li
                key={t.id}
                className={`rounded-xl border p-3 ${
                  overdue ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                    {overdue && '⚠ '}
                    {t.title}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ring-1 ${sm.cls}`}>
                    {sm.label}
                  </span>
                </div>
                <div className="space-y-0.5 text-[11px] text-slate-500">
                  <div>类型：{CASHIER_RECON_TYPE_LABEL[t.reconType] ?? t.reconType}</div>
                  <div>
                    {t.ownerRole ?? (t.owner ? t.owner.name ?? t.owner.email : '未指派')} ·{' '}
                    {CASHIER_CYCLE_LABEL[t.cycle] ?? t.cycle}
                  </div>
                  <div className={overdue ? 'text-rose-700 font-medium' : ''}>
                    {t.dueAt.toISOString().slice(0, 10)}
                    {dl !== null && t.status !== 'DONE' && (
                      <span className="ml-1 text-[10px]">
                        （{overdue ? `逾期 ${-dl}d` : `剩 ${dl}d`}）
                      </span>
                    )}
                  </div>
                </div>
                {t.description && (
                  <p className="mt-2 line-clamp-2 text-[11px] text-slate-600">{t.description}</p>
                )}
                {canEdit && t.status !== 'DONE' && (
                  <form
                    action={async () => {
                      'use server';
                      await markReconDone(t.id);
                    }}
                    className="mt-2"
                  >
                    <button
                      type="submit"
                      className="w-full rounded-lg bg-emerald-50 py-1.5 text-[11px] font-medium text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
                    >
                      ✓ 标记本期完成
                    </button>
                  </form>
                )}
                {t.status === 'DONE' && t.completedAt && (
                  <p className="mt-2 text-[10px] text-emerald-700">
                    已完成 · {t.completedAt.toISOString().slice(0, 10)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
