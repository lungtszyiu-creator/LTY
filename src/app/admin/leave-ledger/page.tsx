import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canManageLeaveBalance } from '@/lib/leaveBalanceAuth';
import { LEDGER_SOURCE_LABEL, type LedgerSource } from '@/lib/leaveBalance';
import { fmtDateTime } from '@/lib/datetime';

export const dynamic = 'force-dynamic';

const POOL_LABEL: Record<string, string> = {
  ANNUAL: '年假',
  COMP:   '调休',
};

const SOURCE_FILTERS: { key: 'all' | LedgerSource; label: string }[] = [
  { key: 'all',               label: '全部' },
  { key: 'ADMIN_SET',         label: '管理员设置' },
  { key: 'ADMIN_ADJUST',      label: '管理员调整' },
  { key: 'LEAVE_APPROVED',    label: '请假扣除' },
  { key: 'OVERTIME_APPROVED', label: '加班入账' },
  { key: 'ROLLBACK',          label: '撤销回滚' },
];

export default async function LeaveLedgerPage({
  searchParams,
}: {
  searchParams: { userId?: string; pool?: string; source?: string };
}) {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  const allowed = await canManageLeaveBalance(session.user.id);
  if (!allowed) redirect('/dashboard');

  const { userId, pool, source } = searchParams;

  const where: any = {};
  if (userId) where.userId = userId;
  if (pool === 'ANNUAL' || pool === 'COMP') where.pool = pool;
  if (source && source !== 'all') where.source = source;

  const [entries, users, userBalances] = await Promise.all([
    prisma.leaveBalanceLedger.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        user:  { select: { id: true, name: true, email: true } },
        actor: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.user.findMany({
      where: { active: true },
      select: {
        id: true, name: true, email: true,
        annualLeaveBalance: true, compLeaveBalance: true,
      },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    }),
    // For the summary bar below each filtered user's entries — just echoes
    // current pool values from User. We already have these in `users`, so
    // nothing extra needed; kept as named for clarity when extending.
    Promise.resolve(null),
  ]);

  const filteredUser = userId ? users.find((u) => u.id === userId) : null;

  return (
    <div className="pt-6 sm:pt-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 rise sm:mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">🧾 假期流水审计</h1>
          <p className="mt-1 text-sm text-slate-500">
            人事部 / 总管理者专属 · 每一次年假 / 调休的增减都在这里留痕。
          </p>
        </div>
        <Link href="/admin/users" className="btn btn-ghost text-xs">去调整员工余额 →</Link>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rise rise-delay-1">
        <form method="get" className="flex flex-wrap items-center gap-2">
          <select
            name="userId"
            defaultValue={userId ?? ''}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm"
          >
            <option value="">全部员工</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
            ))}
          </select>
          <select
            name="pool"
            defaultValue={pool ?? ''}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm"
          >
            <option value="">全部假期池</option>
            <option value="ANNUAL">年假</option>
            <option value="COMP">调休</option>
          </select>
          <select
            name="source"
            defaultValue={source ?? 'all'}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm"
          >
            {SOURCE_FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <button type="submit" className="btn btn-ghost text-xs">筛选</button>
          {(userId || pool || (source && source !== 'all')) && (
            <Link href="/admin/leave-ledger" className="text-xs text-slate-500 hover:underline">清空</Link>
          )}
        </form>
      </div>

      {/* If filtering by a specific user, show their current balances as a
          quick reference at the top. */}
      {filteredUser && (
        <div className="card mb-4 p-4 sm:p-5 rise rise-delay-2">
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">当前余额</div>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-800">{filteredUser.name ?? filteredUser.email}</div>
              <div className="text-xs text-slate-500">{filteredUser.email}</div>
            </div>
            <div className="ml-auto flex gap-4 text-sm">
              <div>
                <div className="text-xs text-slate-500">年假</div>
                <div className="text-xl font-semibold tabular-nums">{filteredUser.annualLeaveBalance.toFixed(1)} 天</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">调休</div>
                <div className="text-xl font-semibold tabular-nums">{filteredUser.compLeaveBalance.toFixed(1)} 天</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="card py-14 text-center text-sm text-slate-500 rise rise-delay-2">
          没有匹配的流水记录
        </div>
      ) : (
        <div className="card overflow-hidden rise rise-delay-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">时间</th>
                  <th className="px-4 py-3 text-left font-medium">员工</th>
                  <th className="px-4 py-3 text-left font-medium">池</th>
                  <th className="px-4 py-3 text-right font-medium">变动</th>
                  <th className="px-4 py-3 text-right font-medium">余额</th>
                  <th className="px-4 py-3 text-left font-medium">来源</th>
                  <th className="px-4 py-3 text-left font-medium">操作人</th>
                  <th className="px-4 py-3 text-left font-medium">备注</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((e) => {
                  const isCredit = e.deltaDays > 0;
                  const srcLabel = LEDGER_SOURCE_LABEL[e.source as LedgerSource] ?? e.source;
                  return (
                    <tr key={e.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(e.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        <Link href={`/admin/leave-ledger?userId=${e.userId}`} className="hover:underline">
                          {e.user.name ?? e.user.email}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">{POOL_LABEL[e.pool] ?? e.pool}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${isCredit ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {isCredit ? '+' : ''}{e.deltaDays.toFixed(2)} 天
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-800">{e.balanceAfter.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-xs">
                        {e.approvalInstanceId ? (
                          <Link href={`/approvals/${e.approvalInstanceId}`} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100">
                            {srcLabel} →
                          </Link>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 ring-1 ring-slate-200">{srcLabel}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">{e.actor ? (e.actor.name ?? e.actor.email) : '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 max-w-xs truncate" title={e.note ?? ''}>{e.note ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-2 text-[11px] text-slate-500">
            最多显示最近 300 条。如需导出，告诉技术同事（原始数据在 LeaveBalanceLedger 表）。
          </div>
        </div>
      )}
    </div>
  );
}
