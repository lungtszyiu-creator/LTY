import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import StatusBadge from '@/components/StatusBadge';
import Countdown from '@/components/Countdown';

export const dynamic = 'force-dynamic';

const FILTERS = [
  { key: 'all',       label: '全部',     q: '' },
  { key: 'OPEN',      label: '待领取',   q: '?status=OPEN' },
  { key: 'CLAIMED',   label: '进行中',   q: '?status=CLAIMED' },
  { key: 'SUBMITTED', label: '待审核',   q: '?status=SUBMITTED' },
  { key: 'APPROVED',  label: '已通过',   q: '?status=APPROVED' },
  { key: 'mine',      label: '我领取的', q: '?mine=claimed' },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { status?: string; mine?: string };
}) {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const where: any = {};
  if (searchParams.status) where.status = searchParams.status;
  if (searchParams.mine === 'claimed') where.claimantId = session.user.id;
  if (searchParams.mine === 'created') where.creatorId = session.user.id;

  const tasks = await prisma.task.findMany({
    where,
    include: {
      creator: { select: { name: true, email: true } },
      claimant: { select: { name: true, email: true } },
      _count: { select: { submissions: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });

  const serialize = (d: Date | null | undefined) => (d ? d.toISOString() : null);

  const stats = await prisma.task.groupBy({ by: ['status'], _count: true });
  const statMap = Object.fromEntries(stats.map((s) => [s.status, s._count]));
  const counters = [
    { label: '待领取', key: 'OPEN', value: statMap.OPEN ?? 0 },
    { label: '进行中', key: 'CLAIMED', value: statMap.CLAIMED ?? 0 },
    { label: '待审核', key: 'SUBMITTED', value: statMap.SUBMITTED ?? 0 },
    { label: '已通过', key: 'APPROVED', value: statMap.APPROVED ?? 0 },
  ];

  return (
    <div className="pt-8">
      <div className="mb-6 flex items-end justify-between">
        <div className="rise">
          <h1 className="text-3xl font-semibold tracking-tight">任务看板</h1>
          <p className="mt-1 text-sm text-slate-500">
            {counters.reduce((a, c) => a + c.value, 0)} 个任务 · 实时同步
          </p>
        </div>
        {session.user.role === 'ADMIN' && (
          <Link href="/admin/tasks/new" className="btn btn-primary rise rise-delay-1">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
            发布任务
          </Link>
        )}
      </div>

      <section className="rise rise-delay-1 mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {counters.map((c) => (
          <Link
            key={c.key}
            href={`/dashboard?status=${c.key}`}
            className="card lift flex items-center justify-between px-4 py-3"
          >
            <span className="text-xs uppercase tracking-wider text-slate-500">{c.label}</span>
            <span className="text-2xl font-semibold tabular-nums">{c.value}</span>
          </Link>
        ))}
      </section>

      <section className="rise rise-delay-2 mb-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const active =
            (f.key === 'all' && !searchParams.status && !searchParams.mine) ||
            searchParams.status === f.key ||
            (f.key === 'mine' && searchParams.mine === 'claimed');
          return (
            <Link
              key={f.key}
              href={`/dashboard${f.q}`}
              className={`rounded-full px-3.5 py-1.5 text-sm transition ${
                active
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </section>

      {tasks.length === 0 ? (
        <div className="card rise rise-delay-3 flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
          </div>
          <p className="text-sm text-slate-500">当前筛选下没有任务</p>
          {session.user.role === 'ADMIN' && (
            <Link href="/admin/tasks/new" className="btn btn-primary text-sm">
              发布第一条任务
            </Link>
          )}
        </div>
      ) : (
        <ul className="rise rise-delay-3 grid gap-3 sm:grid-cols-2">
          {tasks.map((t) => (
            <li key={t.id}>
              <Link href={`/tasks/${t.id}`} className="card lift relative block h-full overflow-hidden p-5">
                <div className="accent-bar absolute inset-x-0 top-0 h-0.5 opacity-60" />
                <div className="mb-3 flex items-start justify-between gap-3">
                  <StatusBadge status={t.status} />
                  {t.reward && (
                    <div className="reward-chip rounded-lg px-2.5 py-1 text-xs">
                      {t.reward}
                    </div>
                  )}
                </div>
                <h3 className="mb-1.5 line-clamp-1 text-base font-semibold tracking-tight">{t.title}</h3>
                <p className="mb-4 line-clamp-2 text-sm leading-relaxed text-slate-500">{t.description}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-amber-200 to-rose-200 text-[9px] font-semibold text-amber-900">
                      {(t.creator.name ?? t.creator.email ?? '?').slice(0, 1).toUpperCase()}
                    </span>
                    {t.creator.name ?? t.creator.email}
                  </span>
                  {t.claimant && (
                    <>
                      <span className="text-slate-300">→</span>
                      <span className="inline-flex items-center gap-1">
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-rose-300 to-red-400 text-[9px] font-semibold text-white">
                          {(t.claimant.name ?? t.claimant.email ?? '?').slice(0, 1).toUpperCase()}
                        </span>
                        {t.claimant.name ?? t.claimant.email}
                      </span>
                    </>
                  )}
                  <span className="ml-auto flex items-center gap-2">
                    {t.status === 'CLAIMED' && t.claimedAt && (
                      <Countdown since={serialize(t.claimedAt)} />
                    )}
                    {t.deadline && (t.status === 'OPEN' || t.status === 'CLAIMED' || t.status === 'REJECTED') && (
                      <Countdown deadline={serialize(t.deadline)} compact size="sm" />
                    )}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
