import Link from 'next/link';
import { fetchMyStats } from '@/lib/stats';
import { MAX_CONCURRENT_CLAIMS } from '@/lib/constants';

export default async function MyStats({ userId }: { userId: string }) {
  const s = await fetchMyStats(userId);
  const nearLimit = s.inProgress >= MAX_CONCURRENT_CLAIMS;

  return (
    <section className="card rise rise-delay-1 relative overflow-hidden p-4 sm:p-6">
      <div className="accent-bar absolute inset-x-0 top-0 h-0.5 opacity-60" />
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 sm:text-xs">我的积分</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tabular-nums tracking-tight">{s.points}</span>
              <span className="text-xs text-slate-500">分</span>
            </div>
          </div>
          {s.rank !== null && (
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 sm:text-xs">战功榜</div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-semibold tabular-nums">#{s.rank}</span>
                <span className="text-xs text-slate-500">/ {s.total}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <StatPill label="进行中" value={s.inProgress} tone={nearLimit ? 'rose' : 'amber'} suffix={` / ${MAX_CONCURRENT_CLAIMS}`} />
          <StatPill label="待审核" value={s.awaitingReview} tone="violet" />
          <StatPill label="已通过" value={s.approved} tone="emerald" />
          {s.rejected > 0 && <StatPill label="被驳回" value={s.rejected} tone="rose" />}
          <Link href="/leaderboard" className="btn btn-ghost text-xs">查看榜单</Link>
        </div>
      </div>
      {nearLimit && (
        <p className="mt-3 text-xs text-rose-600">
          同时进行中已达上限（{MAX_CONCURRENT_CLAIMS} 条），完成并提交一条后才能领取新任务。
        </p>
      )}
    </section>
  );
}

const TONES = {
  rose:    'bg-rose-50 text-rose-700 ring-rose-200',
  amber:   'bg-amber-50 text-amber-800 ring-amber-200',
  violet:  'bg-violet-50 text-violet-700 ring-violet-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
} as const;

function StatPill({ label, value, tone, suffix }: {
  label: string; value: number; tone: keyof typeof TONES; suffix?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 ring-1 ${TONES[tone]}`}>
      <span className="text-[10px] uppercase tracking-widest opacity-70">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}{suffix ?? ''}</span>
    </span>
  );
}
