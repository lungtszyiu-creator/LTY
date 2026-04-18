import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { fetchLeaderboard } from '@/lib/stats';

export const dynamic = 'force-dynamic';

function initial(s: string) { return s.slice(0, 1).toUpperCase(); }

function medal(i: number) {
  if (i === 0) return { emoji: '🥇', ring: 'ring-amber-300',   bg: 'from-amber-100 to-amber-50',  text: 'text-amber-800' };
  if (i === 1) return { emoji: '🥈', ring: 'ring-slate-300',   bg: 'from-slate-100 to-slate-50',  text: 'text-slate-700' };
  if (i === 2) return { emoji: '🥉', ring: 'ring-orange-300',  bg: 'from-orange-100 to-orange-50',text: 'text-orange-800' };
  return null;
}

export default async function LeaderboardPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const rows = await fetchLeaderboard();
  const max = rows[0]?.points ?? 0;
  const meId = session.user.id;

  return (
    <div className="pt-8">
      <div className="mb-6 flex items-end justify-between rise">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">战功榜</h1>
          <p className="mt-1 text-sm text-slate-500">
            按已通过任务积分排序 · 完成得分，对比得见
          </p>
        </div>
        <Link href="/dashboard" className="btn btn-ghost text-xs">返回看板</Link>
      </div>

      {rows.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-20 text-center rise rise-delay-1">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
            <svg className="h-7 w-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 15l3.09 1.62L14.5 13 17 10.54l-3.5-.5L12 7l-1.5 3.04-3.5.5L9.5 13l-.59 3.62L12 15z" /></svg>
          </div>
          <p className="text-sm text-slate-500">还没有已通过的任务，完成第一条任务的人将登上榜首。</p>
        </div>
      ) : (
        <>
          {/* Podium */}
          {rows.length >= 1 && (
            <section className="mb-8 grid gap-4 rise rise-delay-1 sm:grid-cols-3">
              {[1, 0, 2].map((idx) => {
                const r = rows[idx];
                if (!r) return <div key={idx} className="hidden sm:block" />;
                const m = medal(idx)!;
                const first = idx === 0;
                return (
                  <div key={r.userId} className={`card relative flex flex-col items-center gap-2 bg-gradient-to-br ${m.bg} p-6 text-center ${first ? 'sm:-translate-y-3 sm:shadow-lg' : ''}`}>
                    <div className={`flex h-16 w-16 items-center justify-center rounded-full bg-white text-xl font-semibold shadow-sm ring-2 ${m.ring}`}>
                      {initial(r.name ?? r.email)}
                    </div>
                    <div className="text-2xl">{m.emoji}</div>
                    <div className={`text-sm font-semibold ${m.text}`}>{r.name ?? r.email}</div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-semibold tabular-nums">{r.points}</span>
                      <span className="text-xs text-slate-500">分</span>
                    </div>
                    <div className="text-xs text-slate-500">完成 {r.completed} 条</div>
                  </div>
                );
              })}
            </section>
          )}

          {/* Full table */}
          <section className="card overflow-hidden rise rise-delay-2">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">排名</th>
                  <th className="px-5 py-3 text-left font-medium">成员</th>
                  <th className="px-5 py-3 text-left font-medium">贡献</th>
                  <th className="px-5 py-3 text-right font-medium">积分</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => {
                  const isMe = r.userId === meId;
                  const m = medal(i);
                  const w = max > 0 ? (r.points / max) * 100 : 0;
                  return (
                    <tr key={r.userId} className={`transition hover:bg-amber-50/40 ${isMe ? 'bg-amber-50/30' : ''}`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                            m ? `bg-gradient-to-br ${m.bg} ${m.text} ring-1 ${m.ring}` : 'bg-slate-100 text-slate-600'
                          }`}>
                            {i + 1}
                          </span>
                          {m && <span className="text-base leading-none">{m.emoji}</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-rose-400 to-red-700 text-xs font-semibold text-white">
                            {initial(r.name ?? r.email)}
                          </div>
                          <div className="flex flex-col leading-tight">
                            <span className="font-medium">{r.name ?? r.email}</span>
                            {isMe && <span className="text-[10px] uppercase tracking-widest text-amber-700">你</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-rose-500 via-amber-500 to-amber-300"
                              style={{ width: `${w}%` }}
                            />
                          </div>
                          <span className="whitespace-nowrap text-xs text-slate-500">完成 {r.completed} 条</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="tabular-nums text-base font-semibold">{r.points}</span>
                        <span className="ml-1 text-xs text-slate-500">分</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
