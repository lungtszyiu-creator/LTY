/**
 * LicensesTab —— 行政部 · 证照合同列表
 *
 * Mobile：卡片堆，强调到期日 + 责任人
 * Desktop：表格 6 列：类型 / 名称 / 证号 / 到期日 / 责任人 / 状态
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';

const TYPE_LABEL: Record<string, string> = {
  BUSINESS_LICENSE: '营业执照',
  CONTRACT: '合同',
  QUALIFICATION: '资质',
  CERTIFICATE: '证书',
  OTHER: '其它',
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: '在用', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  EXPIRING: { label: '即将到期', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  EXPIRED: { label: '已过期', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  ARCHIVED: { label: '已归档', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

function daysLeft(d: Date | null): number | null {
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

export async function LicensesTab({ canEdit }: { canEdit: boolean }) {
  const licenses = await prisma.adminLicense.findMany({
    orderBy: [{ status: 'asc' }, { expireAt: 'asc' }, { createdAt: 'desc' }],
    take: 100,
    include: { responsible: { select: { id: true, name: true, email: true } } },
  });

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          证照 / 合同（{licenses.length}）
        </h2>
        {canEdit && (
          <Link
            href="/dept/admin/licenses/new"
            className="inline-flex items-center rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-amber-700"
          >
            + 新增证照
          </Link>
        )}
      </div>

      {licenses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center text-sm text-slate-400">
          暂无证照记录。
          {canEdit && (
            <>
              {' '}
              <Link href="/dept/admin/licenses/new" className="text-amber-700 underline">
                立刻新增 →
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Mobile：卡片 */}
          <ul className="space-y-2 md:hidden">
            {licenses.map((l) => {
              const meta = STATUS_META[l.status] ?? STATUS_META.ACTIVE;
              const dl = daysLeft(l.expireAt);
              return (
                <li key={l.id}>
                  <Link
                    href={`/dept/admin/licenses/${l.id}`}
                    className="block rounded-xl border border-slate-200 bg-white p-3 transition active:bg-amber-50/40"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                        {l.name}
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${meta.cls}`}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>{TYPE_LABEL[l.type] ?? l.type}</span>
                      {l.expireAt ? (
                        <span className="tabular-nums">
                          {l.expireAt.toISOString().slice(0, 10)}
                          {dl !== null && (
                            <span className={`ml-1.5 ${dl < 0 ? 'text-rose-600' : dl < 30 ? 'text-amber-700' : 'text-slate-400'}`}>
                              ({dl < 0 ? `逾期 ${-dl}d` : `剩 ${dl}d`})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-400">永久</span>
                      )}
                    </div>
                    {l.identifier && (
                      <div className="mt-1 truncate font-mono text-[11px] text-slate-400">{l.identifier}</div>
                    )}
                    {l.responsible && (
                      <div className="mt-1 text-[11px] text-slate-500">
                        责任人：{l.responsible.name ?? l.responsible.email}
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          {/* Desktop：table-fixed + colgroup 防长「证号」/ 长「名称」推右列 */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[100px]" />{/* 类型 */}
                <col />{/* 名称 — 撑剩余 */}
                <col className="w-[18%]" />{/* 证号 */}
                <col className="w-[160px]" />{/* 到期日 */}
                <col className="w-[120px]" />{/* 责任人 */}
                <col className="w-[80px]" />{/* 状态 */}
              </colgroup>
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">类型</th>
                  <th className="px-3 py-2 text-left">名称 / 对方</th>
                  <th className="px-3 py-2 text-left">证号</th>
                  <th className="px-3 py-2 text-left">到期日</th>
                  <th className="px-3 py-2 text-left">责任人</th>
                  <th className="px-3 py-2 text-left">状态</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((l) => {
                  const meta = STATUS_META[l.status] ?? STATUS_META.ACTIVE;
                  const dl = daysLeft(l.expireAt);
                  return (
                    <tr key={l.id} className="border-t border-slate-100 hover:bg-amber-50/40">
                      <td className="truncate px-3 py-2 align-top text-slate-600">
                        <Link href={`/dept/admin/licenses/${l.id}`} className="block truncate">
                          {TYPE_LABEL[l.type] ?? l.type}
                        </Link>
                      </td>
                      <td className="px-3 py-2 align-top text-slate-800">
                        <Link
                          href={`/dept/admin/licenses/${l.id}`}
                          className="block break-words leading-snug"
                          title={l.name}
                        >
                          {l.name}
                        </Link>
                      </td>
                      <td
                        className="truncate px-3 py-2 align-top font-mono text-xs text-slate-500"
                        title={l.identifier ?? undefined}
                      >
                        {l.identifier ?? '—'}
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap text-xs text-slate-600 tabular-nums">
                        {l.expireAt ? (
                          <>
                            {l.expireAt.toISOString().slice(0, 10)}
                            {dl !== null && (
                              <span className={`ml-1.5 ${dl < 0 ? 'text-rose-600' : dl < 30 ? 'text-amber-700' : 'text-slate-400'}`}>
                                ({dl < 0 ? `逾期 ${-dl}d` : `剩 ${dl}d`})
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-400">永久</span>
                        )}
                      </td>
                      <td
                        className="truncate px-3 py-2 align-top text-xs text-slate-600"
                        title={l.responsible?.name ?? l.responsible?.email ?? undefined}
                      >
                        {l.responsible ? l.responsible.name ?? l.responsible.email : '—'}
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap">
                        <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${meta.cls}`}>
                          {meta.label}
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
