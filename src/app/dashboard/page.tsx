import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import StatusBadge from '@/components/StatusBadge';

export const dynamic = 'force-dynamic';

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

  const filters = [
    { key: 'all', label: '全部', q: '' },
    { key: 'OPEN', label: '待领取', q: '?status=OPEN' },
    { key: 'CLAIMED', label: '进行中', q: '?status=CLAIMED' },
    { key: 'SUBMITTED', label: '待审核', q: '?status=SUBMITTED' },
    { key: 'APPROVED', label: '已通过', q: '?status=APPROVED' },
    { key: 'mine', label: '我领取的', q: '?mine=claimed' },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">任务看板</h1>
        {session.user.role === 'ADMIN' && (
          <Link
            href="/admin/tasks/new"
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
          >
            + 发布任务
          </Link>
        )}
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={`/dashboard${f.q}`}
            className="rounded-full border bg-white px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
          >
            {f.label}
          </Link>
        ))}
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-10 text-center text-slate-500">
          暂无任务
        </div>
      ) : (
        <ul className="space-y-3">
          {tasks.map((t) => (
            <li key={t.id}>
              <Link
                href={`/tasks/${t.id}`}
                className="block rounded-xl border bg-white p-4 hover:border-slate-300 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-medium">{t.title}</h3>
                      <StatusBadge status={t.status} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{t.description}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>发布人：{t.creator.name ?? t.creator.email}</span>
                      {t.claimant && <span>领取人：{t.claimant.name ?? t.claimant.email}</span>}
                      {t.deadline && <span>截止：{new Date(t.deadline).toLocaleString('zh-CN')}</span>}
                      {t._count.submissions > 0 && <span>提交数：{t._count.submissions}</span>}
                    </div>
                  </div>
                  {t.reward && (
                    <div className="shrink-0 rounded-lg bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700">
                      {t.reward}
                    </div>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
