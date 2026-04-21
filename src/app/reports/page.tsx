import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { currentPeriodStart, currentPeriodEnd, currentDueAt, formatPeriod } from '@/lib/periods';
import ReportEditor from './ReportEditor';

export const dynamic = 'force-dynamic';

export default async function MyReportsPage({
  searchParams,
}: {
  searchParams: { type?: 'WEEKLY' | 'MONTHLY' };
}) {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const type: 'WEEKLY' | 'MONTHLY' = searchParams.type === 'MONTHLY' ? 'MONTHLY' : 'WEEKLY';
  const now = new Date();
  const periodStart = currentPeriodStart(type, now);
  const periodEnd = currentPeriodEnd(type, now);
  const dueAt = currentDueAt(type, now);

  const [current, history] = await Promise.all([
    prisma.report.findUnique({
      where: { userId_type_periodStart: { userId: session.user.id, type, periodStart } },
      include: { attachments: true },
    }),
    prisma.report.findMany({
      where: { userId: session.user.id, type },
      orderBy: { periodStart: 'desc' },
      take: 10,
    }),
  ]);

  const periodLabel = formatPeriod(type, periodStart, periodEnd);

  return (
    <div className="pt-6 sm:pt-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 rise sm:mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">📝 工作汇报</h1>
          <p className="mt-1 text-sm text-slate-500">
            周报每周日 23:59 截止 · 月报每月最后工作日 23:59 截止。
          </p>
        </div>
      </div>

      <div className="mb-5 flex gap-2 rise rise-delay-1">
        <a href="/reports?type=WEEKLY" className={`rounded-full px-4 py-1.5 text-sm transition ${type === 'WEEKLY' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>
          周报
        </a>
        <a href="/reports?type=MONTHLY" className={`rounded-full px-4 py-1.5 text-sm transition ${type === 'MONTHLY' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>
          月报
        </a>
      </div>

      <section className="card rise rise-delay-2 p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-widest text-slate-500">当前 {type === 'WEEKLY' ? '周' : '月'}度</div>
            <div className="text-lg font-semibold">{periodLabel}</div>
            <div className="mt-0.5 text-xs text-slate-500">截止 {dueAt.toLocaleString('zh-CN')}</div>
          </div>
          {current?.status === 'LATE' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 text-xs text-rose-700 ring-1 ring-rose-200">⏰ 逾期提交</span>
          )}
          {current?.status === 'SUBMITTED' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700 ring-1 ring-emerald-200">✓ 已提交</span>
          )}
          {!current?.submittedAt && now > dueAt && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 text-xs text-rose-700 ring-1 ring-rose-200">⚠️ 已逾期，尽快补交</span>
          )}
        </div>
        <ReportEditor
          type={type}
          initial={current ? {
            contentDone: current.contentDone ?? '',
            contentPlan: current.contentPlan ?? '',
            contentBlockers: current.contentBlockers ?? '',
            contentAsks: current.contentAsks ?? '',
            submitted: !!current.submittedAt,
          } : { contentDone: '', contentPlan: '', contentBlockers: '', contentAsks: '', submitted: false }}
        />
      </section>

      <section className="mt-8 rise rise-delay-3">
        <h2 className="mb-3 text-lg font-semibold">历史 {type === 'WEEKLY' ? '周报' : '月报'}</h2>
        {history.length === 0 ? (
          <div className="card py-10 text-center text-sm text-slate-500">还没有历史记录</div>
        ) : (
          <ul className="space-y-2">
            {history.map((r) => (
              <li key={r.id} className="card p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{formatPeriod(r.type as any, r.periodStart, r.periodEnd)}</div>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ${
                    r.status === 'SUBMITTED' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' :
                    r.status === 'LATE' ? 'bg-rose-50 text-rose-700 ring-rose-200' :
                    'bg-slate-100 text-slate-500 ring-slate-200'
                  }`}>
                    {r.status === 'SUBMITTED' ? '已提交' : r.status === 'LATE' ? '逾期提交' : '未提交'}
                  </span>
                </div>
                {r.contentDone && <div className="mt-1.5 line-clamp-2 text-xs text-slate-600">✅ {r.contentDone}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
