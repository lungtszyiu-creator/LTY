/**
 * 合规台账 Tab —— 5 子分类 + ⭐ dualLayer 显示
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';
import {
  CASHIER_COMPLIANCE_CATEGORY_LABEL,
  CASHIER_COMPLIANCE_STATUS_META,
  CASHIER_DUAL_LAYER_META,
  daysUntil,
} from '@/lib/cashier-shared';

const SUB_TABS: { key: string; label: string }[] = [
  { key: 'TAX', label: '税务申报' },
  { key: 'LICENSE', label: '证照管理' },
  { key: 'BANK_ACCOUNT', label: '银行账户' },
  { key: 'EXCHANGE_ACCOUNT', label: '交易所账户' },
  { key: 'FIXED_ASSET', label: '固定资产' },
];

export async function ComplianceTab({
  canEdit,
  isSuperAdmin,
  subCategory,
}: {
  canEdit: boolean;
  isSuperAdmin: boolean;
  subCategory: string | null;
}) {
  void canEdit;
  const sub = SUB_TABS.some((s) => s.key === subCategory) ? subCategory! : 'TAX';
  const entries = await prisma.cashierComplianceEntry.findMany({
    where: { category: sub },
    orderBy: [{ status: 'asc' }, { nextDueAt: 'asc' }],
    take: 100,
    include: { responsible: { select: { name: true, email: true } } },
  });

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          合规台账 · {CASHIER_COMPLIANCE_CATEGORY_LABEL[sub]}（{entries.length}）
        </h2>
        <Link
          href="/dept/cashier/compliance/new"
          className="inline-flex items-center rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-rose-700"
        >
          + 新增记录
        </Link>
      </div>

      <nav className="mb-3 flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">
        {SUB_TABS.map((s) => (
          <Link
            key={s.key}
            href={`/dept/cashier?tab=compliance&sub=${s.key}`}
            className={`whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ${
              s.key === sub ? 'bg-rose-50 text-rose-900' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      {isSuperAdmin && (
        <div className="mb-3 rounded-lg border border-violet-200 bg-violet-50/30 p-2 text-[11px] text-violet-800">
          ⭐ 双层结构：
          {Object.entries(CASHIER_DUAL_LAYER_META).map(([k, m]) => (
            <span key={k} className="ml-2 inline-flex items-center gap-1">
              <span className={`rounded px-1.5 py-0.5 ring-1 ${m.cls}`}>{m.label}</span>
              <span className="text-[10px] opacity-70">{m.hint}</span>
            </span>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center text-sm text-slate-400">
          暂无{CASHIER_COMPLIANCE_CATEGORY_LABEL[sub]}记录
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">名称</th>
                <th className="px-4 py-2 text-left">编号</th>
                <th className="px-4 py-2 text-left">周期</th>
                <th className="px-4 py-2 text-left">下次截止</th>
                <th className="px-4 py-2 text-left">负责人</th>
                <th className="px-4 py-2 text-left">层级</th>
                <th className="px-4 py-2 text-left">状态</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const sm = CASHIER_COMPLIANCE_STATUS_META[e.status] ?? CASHIER_COMPLIANCE_STATUS_META.ACTIVE;
                const lm = CASHIER_DUAL_LAYER_META[e.dualLayer] ?? CASHIER_DUAL_LAYER_META.REAL;
                const dl = daysUntil(e.nextDueAt);
                return (
                  <tr key={e.id} className="border-t border-slate-100 hover:bg-rose-50/40">
                    <td className="px-4 py-2 text-slate-800">{e.name}</td>
                    <td className="px-4 py-2 whitespace-nowrap font-mono text-xs text-slate-500">
                      {e.identifier ?? '—'}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-600">{e.cycle ?? '—'}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-600 tabular-nums">
                      {e.nextDueAt?.toISOString().slice(0, 10) ?? '—'}
                      {dl !== null && (
                        <span
                          className={`ml-1 text-[10px] ${
                            dl < 0 ? 'text-rose-600' : dl < 30 ? 'text-amber-700' : 'text-slate-400'
                          }`}
                        >
                          ({dl < 0 ? `逾期 ${-dl}d` : `剩 ${dl}d`})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-600">
                      {e.responsible ? e.responsible.name ?? e.responsible.email : e.responsibleName ?? '—'}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1 ${lm.cls}`}
                        title={lm.hint}
                      >
                        {lm.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${sm.cls}`}>
                        {sm.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
