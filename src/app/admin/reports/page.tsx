import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { hasMinRole, type Role } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { currentPeriodStart, currentPeriodEnd, currentDueAt, formatPeriod } from '@/lib/periods';
import { fmtDateTime } from '@/lib/datetime';

export const dynamic = 'force-dynamic';

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: { type?: 'WEEKLY' | 'MONTHLY' };
}) {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  if (!hasMinRole(session.user.role as Role, 'ADMIN')) redirect('/dashboard');

  const type: 'WEEKLY' | 'MONTHLY' = searchParams.type === 'MONTHLY' ? 'MONTHLY' : 'WEEKLY';
  const now = new Date();
  const periodStart = currentPeriodStart(type, now);
  const periodEnd = currentPeriodEnd(type, now);
  const dueAt = currentDueAt(type, now);

  const [activeUsers, reports] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true, image: true, role: true },
      orderBy: { name: 'asc' },
    }),
    prisma.report.findMany({
      where: { type, periodStart },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  const reportByUser = new Map(reports.map((r) => [r.userId, r]));
  const isPastDue = now > dueAt;

  const submitted = activeUsers.filter((u) => {
    const r = reportByUser.get(u.id);
    return r?.submittedAt;
  }).length;
  const pending = activeUsers.length - submitted;
  const latePeople = activeUsers.filter((u) => {
    const r = reportByUser.get(u.id);
    return !r?.submittedAt && isPastDue;
  });

  return (
    <div className="pt-6 sm:pt-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 rise sm:mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">工作汇报汇总</h1>
          <p className="mt-1 text-sm text-slate-500">按当前{type === 'WEEKLY' ? '周' : '月'}查看所有人的提交情况。逾期高亮，便于追交。</p>
        </div>
      </div>

      <div className="mb-5 flex gap-2 rise rise-delay-1">
        <Link href="/admin/reports?type=WEEKLY" className={`rounded-full px-4 py-1.5 text-sm transition ${type === 'WEEKLY' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>周报</Link>
        <Link href="/admin/reports?type=MONTHLY" className={`rounded-full px-4 py-1.5 text-sm transition ${type === 'MONTHLY' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>月报</Link>
      </div>

      <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 rise rise-delay-1">
        <StatCard label="周期" value={formatPeriod(type, periodStart, periodEnd)} tone="slate" small />
        <StatCard label="截止" value={fmtDateTime(dueAt)} tone={isPastDue ? 'rose' : 'slate'} small />
        <StatCard label="已提交" value={`${submitted}`} tone="emerald" />
        <StatCard label="未提交" value={`${pending}`} tone={pending > 0 && isPastDue ? 'rose' : 'amber'} />
      </section>

      {latePeople.length > 0 && (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 rise rise-delay-2">
          <div className="mb-1 font-medium">⚠️ 逾期未交（{latePeople.length} 人）：</div>
          <div className="text-xs">
            {latePeople.map((u) => u.name ?? u.email).join('、')}
          </div>
        </div>
      )}

      <section className="card rise rise-delay-2 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3 text-left font-medium">成员</th>
              <th className="px-5 py-3 text-left font-medium">状态</th>
              <th className="px-5 py-3 text-left font-medium">本期完成</th>
              <th className="px-5 py-3 text-left font-medium">遇到问题</th>
              <th className="px-5 py-3 text-right font-medium">提交时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {activeUsers.map((u) => {
              const r = reportByUser.get(u.id);
              const isSubmitted = !!r?.submittedAt;
              const isLate = !isSubmitted && isPastDue;
              return (
                <tr key={u.id} className={`transition hover:bg-slate-50/60 ${isLate ? 'bg-rose-50/30' : ''}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-300 to-fuchsia-300 text-xs font-semibold text-white">
                        {(u.name ?? u.email).slice(0, 1).toUpperCase()}
                      </div>
                      <span className="font-medium">{u.name ?? u.email}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {isSubmitted ? (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ${r?.status === 'LATE' ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>
                        {r?.status === 'LATE' ? '⏰ 逾期提交' : '✓ 已提交'}
                      </span>
                    ) : isLate ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700 ring-1 ring-rose-200">⚠️ 未交</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">待提交</span>
                    )}
                  </td>
                  <td className="max-w-xs px-5 py-3">
                    <div className="line-clamp-2 text-slate-700">{r?.contentDone || <span className="text-slate-400">—</span>}</div>
                  </td>
                  <td className="max-w-xs px-5 py-3">
                    <div className={`line-clamp-2 ${r?.contentBlockers ? 'text-amber-800' : 'text-slate-400'}`}>
                      {r?.contentBlockers || '—'}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right text-xs text-slate-500">
                    {r?.submittedAt ? fmtDateTime(r.submittedAt) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function StatCard({ label, value, tone, small }: { label: string; value: string; tone: 'slate' | 'emerald' | 'amber' | 'rose'; small?: boolean }) {
  const cls = {
    slate: 'text-slate-700',
    emerald: 'text-emerald-700',
    amber: 'text-amber-800',
    rose: 'text-rose-700',
  }[tone];
  return (
    <div className="card flex items-center justify-between px-4 py-3">
      <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`${small ? 'text-sm' : 'text-2xl'} font-semibold tabular-nums ${cls}`}>{value}</span>
    </div>
  );
}
