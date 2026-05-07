/**
 * HR · 候选人列表（含 stage 分组 = 招聘漏斗）
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireDeptView } from '@/lib/dept-access';
import { ConfirmDeleteForm } from '@/app/dept/admin/_components/ConfirmDeleteForm';
import { deleteHrCandidate } from '../_actions';

export const dynamic = 'force-dynamic';

const STAGE_LABEL: Record<string, string> = {
  APPLIED: '投递',
  SCREENING: '初筛',
  INTERVIEWING: '面试中',
  OFFER: 'Offer',
  HIRED: '已到岗',
  REJECTED: '已拒绝',
};

const STAGE_META: Record<string, { cls: string }> = {
  APPLIED: { cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
  SCREENING: { cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  INTERVIEWING: { cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  OFFER: { cls: 'bg-violet-50 text-violet-700 ring-violet-200' },
  HIRED: { cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  REJECTED: { cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

export default async function HrCandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const ctx = await requireDeptView('hr');
  const sp = await searchParams;
  const filter = sp.stage ?? 'all';
  const canEdit = ctx.level === 'LEAD' || ctx.isSuperAdmin;

  const where: { stage?: string } = {};
  if (Object.keys(STAGE_LABEL).includes(filter)) {
    where.stage = filter;
  }

  const candidates = await prisma.hrCandidate.findMany({
    where,
    orderBy: [{ stage: 'asc' }, { appliedAt: 'desc' }],
    take: 200,
    include: { position: { select: { id: true, title: true } } },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/dept/hr" className="text-sm text-slate-500 hover:text-slate-800">
            ← 返回 HR
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">候选人库（{candidates.length}）</h1>
        </div>
        {canEdit && (
          <Link
            href="/dept/hr/candidates/new"
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-rose-700"
          >
            + 添加候选人
          </Link>
        )}
      </div>

      <nav className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:rounded-xl sm:border sm:bg-white sm:px-1.5 sm:py-1">
        <Link
          href="/dept/hr/candidates"
          className={`relative inline-flex shrink-0 items-center whitespace-nowrap border-b-2 px-3 py-2 text-sm transition sm:rounded-lg sm:border-b-0 sm:py-1.5 ${
            filter === 'all'
              ? 'border-rose-500 text-rose-700 sm:bg-rose-50'
              : 'border-transparent text-slate-500 hover:text-slate-800 sm:hover:bg-slate-50'
          }`}
        >
          全部
        </Link>
        {Object.entries(STAGE_LABEL).map(([k, v]) => {
          const active = filter === k;
          return (
            <Link
              key={k}
              href={`/dept/hr/candidates?stage=${k}`}
              className={`relative inline-flex shrink-0 items-center whitespace-nowrap border-b-2 px-3 py-2 text-sm transition sm:rounded-lg sm:border-b-0 sm:py-1.5 ${
                active
                  ? 'border-rose-500 text-rose-700 sm:bg-rose-50'
                  : 'border-transparent text-slate-500 hover:text-slate-800 sm:hover:bg-slate-50'
              }`}
            >
              {v}
            </Link>
          );
        })}
      </nav>

      {candidates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center text-sm text-slate-400">
          暂无候选人。{canEdit && (
            <>
              {' '}
              <Link href="/dept/hr/candidates/new" className="text-rose-700 underline">立刻添加 →</Link>
            </>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {candidates.map((c) => {
            const sm = STAGE_META[c.stage] ?? STAGE_META.APPLIED;
            const dlAction = deleteHrCandidate.bind(null, c.id);
            return (
              <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-sm font-medium text-slate-800">{c.name}</div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${sm.cls}`}>
                    {STAGE_LABEL[c.stage] ?? c.stage}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                  {c.position && <span>应聘：{c.position.title}</span>}
                  {c.phone && <span>· 📞 {c.phone}</span>}
                  {c.email && <span>· ✉ {c.email}</span>}
                  <span>· 投递 {c.appliedAt.toISOString().slice(0, 10)}</span>
                </div>
                {c.notes && <p className="mt-1 text-xs text-slate-600">{c.notes}</p>}
                {ctx.isSuperAdmin && (
                  <div className="mt-2">
                    <ConfirmDeleteForm
                      action={dlAction}
                      message={`永久删除候选人「${c.name}」？`}
                    >
                      <button type="submit" className="text-[11px] text-rose-600 hover:text-rose-800 hover:underline">
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
