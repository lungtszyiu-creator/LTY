/**
 * AssetsTab —— 行政部 · 固定资产列表
 *
 * Mobile：卡片，desktop：表格。状态色 + 编号。
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';

const CATEGORY_LABEL: Record<string, string> = {
  OFFICE_EQUIPMENT: '办公设备',
  FURNITURE: '家具',
  ELECTRONICS: '电子设备',
  OTHER: '其它',
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  IN_USE: { label: '在用', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  IDLE: { label: '闲置', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  RETIRED: { label: '报废', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
  LOST: { label: '丢失', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

export async function AssetsTab({ canEdit }: { canEdit: boolean }) {
  const assets = await prisma.adminFixedAsset.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 100,
    include: { responsible: { select: { id: true, name: true, email: true } } },
  });

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          固定资产（{assets.length}）
        </h2>
        {canEdit && (
          <Link
            href="/dept/admin/assets/new"
            className="inline-flex items-center rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-amber-700"
          >
            + 新增资产
          </Link>
        )}
      </div>

      {assets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center text-sm text-slate-400">
          暂无资产记录。
          {canEdit && (
            <>
              {' '}
              <Link href="/dept/admin/assets/new" className="text-amber-700 underline">
                立刻新增 →
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Mobile */}
          <ul className="space-y-2 md:hidden">
            {assets.map((a) => {
              const meta = STATUS_META[a.status] ?? STATUS_META.IN_USE;
              return (
                <li key={a.id}>
                  <Link
                    href={`/dept/admin/assets/${a.id}`}
                    className="block rounded-xl border border-slate-200 bg-white p-3 transition active:bg-amber-50/40"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                        {a.name}
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${meta.cls}`}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>{CATEGORY_LABEL[a.category] ?? a.category}</span>
                      {a.assetCode && (
                        <span className="font-mono text-[11px] text-slate-400">{a.assetCode}</span>
                      )}
                    </div>
                    {a.location && (
                      <div className="mt-1 truncate text-[11px] text-slate-500">📍 {a.location}</div>
                    )}
                    {a.responsible && (
                      <div className="mt-1 text-[11px] text-slate-500">
                        责任人：{a.responsible.name ?? a.responsible.email}
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          {/* Desktop */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">编号</th>
                  <th className="px-4 py-2 text-left">名称</th>
                  <th className="px-4 py-2 text-left">类别</th>
                  <th className="px-4 py-2 text-left">位置</th>
                  <th className="px-4 py-2 text-left">责任人</th>
                  <th className="px-4 py-2 text-left">状态</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => {
                  const meta = STATUS_META[a.status] ?? STATUS_META.IN_USE;
                  return (
                    <tr key={a.id} className="border-t border-slate-100 hover:bg-amber-50/40">
                      <td className="px-4 py-2 whitespace-nowrap font-mono text-xs text-slate-500">
                        <Link href={`/dept/admin/assets/${a.id}`} className="block">
                          {a.assetCode ?? '—'}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-slate-800">
                        <Link href={`/dept/admin/assets/${a.id}`} className="block">
                          {a.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-600">
                        {CATEGORY_LABEL[a.category] ?? a.category}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-600">{a.location ?? '—'}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-600">
                        {a.responsible ? a.responsible.name ?? a.responsible.email : '—'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${meta.cls}`}>
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
