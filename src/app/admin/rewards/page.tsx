import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { hasMinRole, type Role } from '@/lib/auth';
import { prisma } from '@/lib/db';
import RewardsAdminClient from './RewardsAdminClient';

export const dynamic = 'force-dynamic';

export default async function AdminRewardsPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  if (!hasMinRole(session.user.role as Role, 'ADMIN')) redirect('/dashboard');

  const items = await prisma.rewardIssuance.findMany({
    include: {
      task: { select: { id: true, title: true, reward: true, points: true } },
      recipient: { select: { id: true, name: true, email: true, image: true } },
      issuedBy: { select: { id: true, name: true, email: true } },
      receipts: true,
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });

  const stats = {
    pending: items.filter((i) => i.status === 'PENDING').length,
    issued: items.filter((i) => i.status === 'ISSUED').length,
    acknowledged: items.filter((i) => i.status === 'ACKNOWLEDGED').length,
    disputed: items.filter((i) => i.status === 'DISPUTED').length,
  };

  return (
    <div className="pt-6 sm:pt-8">
      <div className="mb-5 rise sm:mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">奖励发放</h1>
        <p className="mt-1 text-sm text-slate-500">
          每条审核通过的任务自动进入这里。标记已发放、上传凭证、等收件人确认 —— 全流程留痕。
        </p>
      </div>

      <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 rise rise-delay-1">
        <StatCard label="待发放" value={stats.pending} tone="amber" />
        <StatCard label="已发放" value={stats.issued} tone="sky" />
        <StatCard label="已确认" value={stats.acknowledged} tone="emerald" />
        <StatCard label="有异议" value={stats.disputed} tone="rose" />
      </section>

      <RewardsAdminClient
        meId={session.user.id}
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

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'sky' | 'emerald' | 'rose' }) {
  const toneClasses = {
    amber: 'text-amber-800',
    sky: 'text-sky-700',
    emerald: 'text-emerald-700',
    rose: 'text-rose-700',
  }[tone];
  return (
    <div className="card flex items-center justify-between px-4 py-3">
      <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`text-2xl font-semibold tabular-nums ${toneClasses}`}>{value}</span>
    </div>
  );
}
