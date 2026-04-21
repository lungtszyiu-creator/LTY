import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { currentPeriodStart, currentPeriodEnd, currentDueAt, formatPeriod } from '@/lib/periods';
import { fmtDateTime } from '@/lib/datetime';
import ReportEditor from './ReportEditor';
import ReportHistoryList from './ReportHistoryList';
import IncomingReportsList from './IncomingReportsList';

export const dynamic = 'force-dynamic';

export default async function MyReportsPage({
  searchParams,
}: {
  searchParams: { type?: 'WEEKLY' | 'MONTHLY'; tab?: 'mine' | 'incoming' };
}) {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const type: 'WEEKLY' | 'MONTHLY' = searchParams.type === 'MONTHLY' ? 'MONTHLY' : 'WEEKLY';
  const tab = searchParams.tab === 'incoming' ? 'incoming' : 'mine';
  const now = new Date();
  // Note: badge clearing is per-item — each incoming report has its own
  // "已阅" button that stamps readAtByReporter. We intentionally do NOT
  // bulk-clear on tab visit anymore so the recipient decides what's read.
  const periodStart = currentPeriodStart(type, now);
  const periodEnd = currentPeriodEnd(type, now);
  const dueAt = currentDueAt(type, now);

  const [current, history, incoming, users, incomingCount] = await Promise.all([
    prisma.report.findUnique({
      where: { userId_type_periodStart: { userId: session.user.id, type, periodStart } },
      include: { attachments: true, reportTo: { select: { id: true, name: true, email: true } } },
    }),
    // My own history
    prisma.report.findMany({
      where: { userId: session.user.id, type },
      orderBy: { periodStart: 'desc' },
      take: 20,
      include: { reportTo: { select: { id: true, name: true, email: true } } },
    }),
    // Reports others sent TO me (my inbox)
    prisma.report.findMany({
      where: { reportToId: session.user.id, type, submittedAt: { not: null } },
      orderBy: { periodStart: 'desc' },
      take: 50,
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    }),
    // People I can pick as my reportee (all active users except self)
    prisma.user.findMany({
      where: { active: true, id: { not: session.user.id } },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: 'asc' }],
    }),
    // Only UNREAD incoming — matches Nav red-dot semantics so the "你有 X
    // 份等你查阅" banner and tab badge vanish the moment you finish reading.
    prisma.report.count({
      where: { reportToId: session.user.id, submittedAt: { not: null }, readAtByReporter: null },
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

      {incomingCount > 0 && tab === 'mine' && (
        <a
          href={`/reports?tab=incoming&type=${type}`}
          className="mb-5 flex items-center gap-3 rounded-xl border border-indigo-300 bg-gradient-to-r from-indigo-50 via-white to-indigo-50 p-4 transition hover:shadow-md rise rise-delay-1"
        >
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-xl text-white">
            📬
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-bold text-white">
              {incomingCount}
            </span>
          </div>
          <div className="flex-1">
            <div className="font-semibold text-indigo-900">你有 {incomingCount} 份汇报等你查阅</div>
            <div className="text-xs text-indigo-700">下属已提交工作汇报给你，点此查看 →</div>
          </div>
          <span className="text-indigo-600">→</span>
        </a>
      )}

      <div className="mb-5 flex flex-wrap gap-2 rise rise-delay-1">
        <a href={`/reports?tab=mine&type=${type}`} className={`rounded-full px-4 py-1.5 text-sm transition ${tab === 'mine' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>
          我的汇报
        </a>
        <a href={`/reports?tab=incoming&type=${type}`} className={`rounded-full px-4 py-1.5 text-sm transition ${tab === 'incoming' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>
          汇报给我的
          {incomingCount > 0 && (
            <span className={`ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] ${tab === 'incoming' ? 'bg-white/20' : 'bg-indigo-100 text-indigo-700'}`}>
              {incomingCount}
            </span>
          )}
        </a>
        <span className="mx-1 w-px self-center bg-slate-200" />
        <a href={`/reports?tab=${tab}&type=WEEKLY`} className={`rounded-full px-4 py-1.5 text-sm transition ${type === 'WEEKLY' ? 'bg-amber-500 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>
          周报
        </a>
        <a href={`/reports?tab=${tab}&type=MONTHLY`} className={`rounded-full px-4 py-1.5 text-sm transition ${type === 'MONTHLY' ? 'bg-amber-500 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>
          月报
        </a>
      </div>

      {tab === 'mine' ? (
        <>
          <section className="card rise rise-delay-2 p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs uppercase tracking-widest text-slate-500">当前 {type === 'WEEKLY' ? '周' : '月'}度</div>
                <div className="text-lg font-semibold">{periodLabel}</div>
                <div className="mt-0.5 text-xs text-slate-500">截止 {fmtDateTime(dueAt)}</div>
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
              users={users}
              initial={current ? {
                contentDone: current.contentDone ?? '',
                contentPlan: current.contentPlan ?? '',
                contentBlockers: current.contentBlockers ?? '',
                contentAsks: current.contentAsks ?? '',
                reportToId: current.reportToId ?? '',
                reportToName: current.reportTo?.name ?? current.reportTo?.email ?? null,
                submitted: !!current.submittedAt,
                submittedAt: current.submittedAt?.toISOString() ?? null,
                status: current.status as any,
              } : {
                contentDone: '', contentPlan: '', contentBlockers: '', contentAsks: '',
                reportToId: '', reportToName: null,
                submitted: false,
              }}
            />
          </section>

          <section className="mt-8 rise rise-delay-3">
            <h2 className="mb-3 text-lg font-semibold">历史 {type === 'WEEKLY' ? '周报' : '月报'}</h2>
            <ReportHistoryList
              canDelete={session.user.role === 'SUPER_ADMIN'}
              items={history.map((r) => ({
                id: r.id,
                periodLabel: formatPeriod(r.type as any, r.periodStart, r.periodEnd),
                status: r.status,
                submittedAt: r.submittedAt?.toISOString() ?? null,
                contentDone: r.contentDone,
                contentPlan: r.contentPlan,
                contentBlockers: r.contentBlockers,
                contentAsks: r.contentAsks,
                reportToName: r.reportTo?.name ?? r.reportTo?.email ?? null,
              }))}
              emptyMessage="还没有历史记录"
            />
          </section>
        </>
      ) : (
        <section className="rise rise-delay-2">
          <h2 className="mb-3 text-lg font-semibold">{type === 'WEEKLY' ? '周报' : '月报'} · 汇报给我的</h2>
          <IncomingReportsList
            items={incoming.map((r) => ({
              id: r.id,
              periodLabel: formatPeriod(r.type as any, r.periodStart, r.periodEnd),
              status: r.status,
              submittedAt: r.submittedAt?.toISOString() ?? null,
              readAtByReporter: r.readAtByReporter?.toISOString() ?? null,
              contentDone: r.contentDone,
              contentPlan: r.contentPlan,
              contentBlockers: r.contentBlockers,
              contentAsks: r.contentAsks,
              author: { id: r.user.id, name: r.user.name, email: r.user.email ?? '', image: r.user.image },
            }))}
          />
        </section>
      )}
    </div>
  );
}

