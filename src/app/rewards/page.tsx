import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import MyRewardsClient from './MyRewardsClient';

export const dynamic = 'force-dynamic';

export default async function MyRewardsPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const items = await prisma.rewardIssuance.findMany({
    where: { recipientId: session.user.id },
    include: {
      task: { select: { id: true, title: true, reward: true, points: true } },
      issuedBy: { select: { id: true, name: true, email: true } },
      receipts: true,
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });

  const totals = {
    pending: items.filter((i) => i.status === 'PENDING').length,
    issued: items.filter((i) => i.status === 'ISSUED').length,
    acknowledged: items.filter((i) => i.status === 'ACKNOWLEDGED').length,
    points: items
      .filter((i) => i.status === 'ISSUED' || i.status === 'ACKNOWLEDGED')
      .reduce((a, c) => a + c.points, 0),
  };

  return (
    <div className="pt-6 sm:pt-8">
      <div className="mb-5 rise sm:mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">我的奖励</h1>
        <p className="mt-1 text-sm text-slate-500">
          所有审核通过的任务奖励都会在这里留痕。收到奖励后，点"已收到"给老板一个回执。
        </p>
      </div>

      <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 rise rise-delay-1">
        <Stat label="待发放" value={totals.pending} tone="amber" />
        <Stat label="已发放待确认" value={totals.issued} tone="sky" />
        <Stat label="已确认" value={totals.acknowledged} tone="emerald" />
        <Stat label="累计积分" value={totals.points} tone="violet" />
      </section>

      <MyRewardsClient
        initial={items.map((i) => ({
          ...i,
          createdAt: i.createdAt.toISOString(),
          updatedAt: i.updatedAt.toISOString(),
          issuedAt: i.issuedAt?.toISOString() ?? null,
          acknowledgedAt: i.acknowledgedAt?.toISOString() ?? null,
          receipts: i.receipts.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
        }))}
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'sky' | 'emerald' | 'violet' }) {
  const cls = {
    amber: 'text-amber-800',
    sky: 'text-sky-700',
    emerald: 'text-emerald-700',
    violet: 'text-violet-700',
  }[tone];
  return (
    <div className="card flex items-center justify-between px-4 py-3">
      <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`text-2xl font-semibold tabular-nums ${cls}`}>{value}</span>
    </div>
  );
}
