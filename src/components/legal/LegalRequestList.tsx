/**
 * 法务需求列表 —— LTY 和 MC 共用，仅 deptSlug 不同（决定详情链接前缀）
 */
import Link from 'next/link';
import {
  type LegalRequestRow,
  LEGAL_CATEGORY_LABEL,
  LEGAL_PRIORITY_META,
  LEGAL_STATUS_META,
} from '@/lib/legal-shared';

export function LegalRequestList({
  requests,
  deptSlug,
  canEdit,
}: {
  requests: LegalRequestRow[];
  deptSlug: string;
  canEdit: boolean;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          需求工单（{requests.length}）
        </h2>
        {canEdit && (
          <Link
            href={`/dept/${deptSlug}/requests/new`}
            className="inline-flex items-center rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-sky-700"
          >
            + 发起需求
          </Link>
        )}
      </div>

      {requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center text-sm text-slate-400">
          暂无需求记录。
          {canEdit && (
            <>
              {' '}
              <Link href={`/dept/${deptSlug}/requests/new`} className="text-sky-700 underline">
                立刻发起 →
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Mobile：卡片堆 */}
          <ul className="space-y-2 md:hidden">
            {requests.map((r) => {
              const sm = LEGAL_STATUS_META[r.status] ?? LEGAL_STATUS_META.OPEN;
              const pm = LEGAL_PRIORITY_META[r.priority] ?? LEGAL_PRIORITY_META.NORMAL;
              return (
                <li key={r.id}>
                  <Link
                    href={`/dept/${deptSlug}/requests/${r.id}`}
                    className="block rounded-xl border border-slate-200 bg-white p-3 transition active:bg-sky-50/40"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                        {r.title}
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${sm.cls}`}>
                        {sm.label}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${pm.dot}`} />
                        {pm.label}
                        {r.category && (
                          <span className="ml-1 text-slate-400">· {LEGAL_CATEGORY_LABEL[r.category] ?? r.category}</span>
                        )}
                      </span>
                      <span className="tabular-nums text-[11px] text-slate-400">
                        {r.createdAt.toISOString().slice(0, 10)}
                      </span>
                    </div>
                    {r.requester && (
                      <div className="mt-1 text-[11px] text-slate-500">
                        发起：{r.requester.name ?? r.requester.email}
                        {r.assignee && (
                          <> · 负责：{r.assignee.name ?? r.assignee.email}</>
                        )}
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          {/* Desktop：表格 */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">标题</th>
                  <th className="px-4 py-2 text-left">类型</th>
                  <th className="px-4 py-2 text-left">优先级</th>
                  <th className="px-4 py-2 text-left">发起人</th>
                  <th className="px-4 py-2 text-left">负责人</th>
                  <th className="px-4 py-2 text-left">状态</th>
                  <th className="px-4 py-2 text-left">创建</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const sm = LEGAL_STATUS_META[r.status] ?? LEGAL_STATUS_META.OPEN;
                  const pm = LEGAL_PRIORITY_META[r.priority] ?? LEGAL_PRIORITY_META.NORMAL;
                  return (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-sky-50/40">
                      <td className="px-4 py-2 text-slate-800">
                        <Link href={`/dept/${deptSlug}/requests/${r.id}`} className="block">
                          {r.title}
                        </Link>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-600">
                        {r.category ? LEGAL_CATEGORY_LABEL[r.category] ?? r.category : '—'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${pm.cls}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${pm.dot}`} />
                          {pm.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-600">
                        {r.requester ? r.requester.name ?? r.requester.email : '—'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-600">
                        {r.assignee ? r.assignee.name ?? r.assignee.email : '—'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${sm.cls}`}>
                          {sm.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-500 tabular-nums">
                        {r.createdAt.toISOString().slice(0, 10)}
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
