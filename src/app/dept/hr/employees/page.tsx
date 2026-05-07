/**
 * HR · 员工档案列表 (/dept/hr/employees)
 *
 * Tabs: 全部 / 在职 / 试用期 / 远程 / 坐班 / 离职 —— 用 ?status= filter
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireDeptView } from '@/lib/dept-access';

export const dynamic = 'force-dynamic';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: '在职', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  PROBATION: { label: '试用期', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  RESIGNED: { label: '已离职', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

const EMP_TYPE_LABEL: Record<string, string> = {
  FULL_TIME: '全职',
  PART_TIME: '兼职',
  INTERN: '实习',
  CONTRACTOR: '外包',
};

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'ACTIVE', label: '在职' },
  { key: 'PROBATION', label: '试用期' },
  { key: 'remote', label: '远程' },
  { key: 'onsite', label: '坐班' },
  { key: 'RESIGNED', label: '离职' },
];

function daysLeft(d: Date | null): number | null {
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

export default async function HrEmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await requireDeptView('hr');
  const sp = await searchParams;
  const filter = sp.status ?? 'all';
  const canEdit = ctx.level === 'LEAD' || ctx.isSuperAdmin;

  const where: { status?: { in: string[] } | string; workLocation?: string } = {};
  if (filter === 'ACTIVE' || filter === 'PROBATION' || filter === 'RESIGNED') {
    where.status = filter;
  } else if (filter === 'remote') {
    where.workLocation = 'REMOTE';
    where.status = { in: ['ACTIVE', 'PROBATION'] };
  } else if (filter === 'onsite') {
    where.workLocation = 'ONSITE';
    where.status = { in: ['ACTIVE', 'PROBATION'] };
  }

  const employees = await prisma.hrEmployeeProfile.findMany({
    where,
    orderBy: [{ status: 'asc' }, { hireDate: 'desc' }],
    take: 200,
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/dept/hr" className="text-sm text-slate-500 hover:text-slate-800">
            ← 返回 HR
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">员工档案（{employees.length}）</h1>
        </div>
        {canEdit && (
          <Link
            href="/dept/hr/employees/new"
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-rose-700"
          >
            + 新增员工档案
          </Link>
        )}
      </div>

      <nav className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:rounded-xl sm:border sm:bg-white sm:px-1.5 sm:py-1">
        {TABS.map((t) => {
          const active = filter === t.key;
          const href = t.key === 'all' ? '/dept/hr/employees' : `/dept/hr/employees?status=${t.key}`;
          return (
            <Link
              key={t.key}
              href={href}
              className={`relative inline-flex shrink-0 items-center whitespace-nowrap border-b-2 px-3 py-2 text-sm transition sm:rounded-lg sm:border-b-0 sm:py-1.5 ${
                active
                  ? 'border-rose-500 text-rose-700 sm:bg-rose-50'
                  : 'border-transparent text-slate-500 hover:text-slate-800 sm:hover:bg-slate-50'
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {employees.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center text-sm text-slate-400">
          暂无员工档案。{canEdit && (
            <>
              {' '}
              <Link href="/dept/hr/employees/new" className="text-rose-700 underline">
                立刻新增 →
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Mobile：卡片堆 */}
          <ul className="space-y-2 md:hidden">
            {employees.map((e) => {
              const sm = STATUS_META[e.status] ?? STATUS_META.ACTIVE;
              const probDays = daysLeft(e.probationEnd);
              const idDays = daysLeft(e.idExpireAt);
              return (
                <li key={e.id}>
                  <Link
                    href={`/dept/hr/employees/${e.id}`}
                    className="block rounded-xl border border-slate-200 bg-white p-3 transition active:bg-rose-50/40"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                        {e.user.name ?? e.user.email}
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${sm.cls}`}>
                        {sm.label}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>{e.department ?? '—'} · {e.positionTitle ?? '—'}</span>
                      <span>{EMP_TYPE_LABEL[e.employmentType] ?? e.employmentType} · {e.workLocation === 'REMOTE' ? '🌐 远程' : '🏢 坐班'}</span>
                    </div>
                    {(probDays !== null && probDays >= 0 && probDays <= 30) && (
                      <div className="mt-1 text-[11px] text-amber-700">
                        ⚠ 试用期 {probDays} 天后到期（{e.probationEnd!.toISOString().slice(0, 10)}）
                      </div>
                    )}
                    {(idDays !== null && idDays >= 0 && idDays <= 60) && (
                      <div className="mt-1 text-[11px] text-rose-700">
                        🔔 证件 {idDays} 天后到期（{e.idExpireAt!.toISOString().slice(0, 10)}）
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
                  <th className="px-4 py-2 text-left">姓名</th>
                  <th className="px-4 py-2 text-left">部门 / 职位</th>
                  <th className="px-4 py-2 text-left">类型 / 地点</th>
                  <th className="px-4 py-2 text-left">入职日期</th>
                  <th className="px-4 py-2 text-left">试用期/合同/证件</th>
                  <th className="px-4 py-2 text-left">状态</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => {
                  const sm = STATUS_META[e.status] ?? STATUS_META.ACTIVE;
                  const probDays = daysLeft(e.probationEnd);
                  const idDays = daysLeft(e.idExpireAt);
                  return (
                    <tr key={e.id} className="border-t border-slate-100 hover:bg-rose-50/40">
                      <td className="px-4 py-2 text-slate-800">
                        <Link href={`/dept/hr/employees/${e.id}`} className="block font-medium">
                          {e.user.name ?? e.user.email}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-600">
                        {e.department ?? '—'}
                        {e.positionTitle && <div className="text-[11px] text-slate-400">{e.positionTitle}</div>}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-600">
                        {EMP_TYPE_LABEL[e.employmentType] ?? e.employmentType} · {e.workLocation === 'REMOTE' ? '远程' : '坐班'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-600 tabular-nums">
                        {e.hireDate ? e.hireDate.toISOString().slice(0, 10) : '—'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-[11px] text-slate-500">
                        {probDays !== null && probDays >= 0 && probDays <= 30 && (
                          <div className="text-amber-700">试用 {probDays}d</div>
                        )}
                        {idDays !== null && idDays >= 0 && idDays <= 60 && (
                          <div className="text-rose-700">证件 {idDays}d</div>
                        )}
                        {!(probDays !== null && probDays <= 30) && !(idDays !== null && idDays <= 60) && '—'}
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
        </>
      )}
    </div>
  );
}
