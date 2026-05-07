/**
 * HR · 在招岗位列表
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireDeptView } from '@/lib/dept-access';
import { ConfirmDeleteForm } from '@/app/dept/admin/_components/ConfirmDeleteForm';
import { deleteHrPosition } from '../_actions';

export const dynamic = 'force-dynamic';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  RECRUITING: { label: '招聘中', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  PAUSED: { label: '暂停', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  CLOSED: { label: '关闭', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

export default async function HrPositionsPage() {
  const ctx = await requireDeptView('hr');
  const canEdit = ctx.level === 'LEAD' || ctx.isSuperAdmin;

  const positions = await prisma.hrPosition.findMany({
    orderBy: [{ status: 'asc' }, { deadline: 'asc' }, { createdAt: 'desc' }],
    take: 100,
    include: {
      lead: { select: { id: true, name: true, email: true } },
      _count: { select: { candidates: true } },
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/dept/hr" className="text-sm text-slate-500 hover:text-slate-800">
            ← 返回 HR
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">在招岗位（{positions.length}）</h1>
        </div>
        {canEdit && (
          <Link
            href="/dept/hr/positions/new"
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-rose-700"
          >
            + 新建岗位
          </Link>
        )}
      </div>

      {positions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center text-sm text-slate-400">
          暂无岗位。{canEdit && (
            <>
              {' '}
              <Link href="/dept/hr/positions/new" className="text-rose-700 underline">立刻新建 →</Link>
            </>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {positions.map((p) => {
            const sm = STATUS_META[p.status] ?? STATUS_META.RECRUITING;
            const dlAction = deleteHrPosition.bind(null, p.id);
            return (
              <li key={p.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                    {p.title}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${sm.cls}`}>
                    {sm.label}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                  <span>{p.department ?? '—'}</span>
                  <span>· {p.headcount} 人</span>
                  {p.lead && <span>· 负责人：{p.lead.name ?? p.lead.email}</span>}
                  <span>· 候选人：{p._count.candidates}</span>
                  {p.deadline && (
                    <span className="text-amber-700">· 截止 {p.deadline.toISOString().slice(0, 10)}</span>
                  )}
                </div>
                {p.description && (
                  <p className="mt-1 text-xs text-slate-600">{p.description}</p>
                )}
                {ctx.isSuperAdmin && (
                  <div className="mt-2">
                    <ConfirmDeleteForm
                      action={dlAction}
                      message={`永久删除岗位「${p.title}」？候选人会保留但岗位关联会清空。`}
                    >
                      <button
                        type="submit"
                        className="text-[11px] text-rose-600 hover:text-rose-800 hover:underline"
                      >
                        🗑️ 删除
                      </button>
                    </ConfirmDeleteForm>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
