import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import StatusBadge from '@/components/StatusBadge';
import PriorityBadge from '@/components/PriorityBadge';
import ContributionBadge from '@/components/ContributionBadge';
import Countdown from '@/components/Countdown';
import TaskActions from './TaskActions';
import ReviewFormClient from './ReviewFormClient';
import AdminTaskMenu from './AdminTaskMenu';

export const dynamic = 'force-dynamic';

function fmt(d: Date | null | undefined) {
  return d ? new Date(d).toLocaleString('zh-CN') : '';
}

function initial(s: string | null | undefined) {
  return (s || '?').slice(0, 1).toUpperCase();
}

export default async function TaskDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const task = await prisma.task.findUnique({
    where: { id: params.id },
    include: {
      creator: { select: { id: true, name: true, email: true } },
      claimant: { select: { id: true, name: true, email: true } },
      attachments: true,
      submissions: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          reviewer: { select: { id: true, name: true, email: true } },
          attachments: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      claims: {
        where: { releasedAt: null },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { claimedAt: 'asc' },
      },
      rewards: {
        include: {
          recipient: { select: { id: true, name: true, email: true } },
          issuedBy: { select: { id: true, name: true, email: true } },
          receipts: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      penalties: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          issuedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!task) notFound();

  const me = session.user;
  const isAdmin = me.role === 'ADMIN' || me.role === 'SUPER_ADMIN';
  const myClaimActive = task.claims.some((c) => c.userId === me.id);

  return (
    <div className="space-y-6 pt-8">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-800">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" /></svg>
        返回看板
      </Link>

      <article className="card rise relative overflow-hidden p-5 sm:p-7">
        <div className="accent-bar absolute inset-x-0 top-0 h-1 opacity-80" />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
              <ContributionBadge contribution={task.contribution} />
              {task.allowMultiClaim ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700 ring-1 ring-indigo-200">
                  👥 多人共享 · 验收选优
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200">
                  🔒 独占 · 先到先得
                </span>
              )}
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500">创建于 {fmt(task.createdAt)}</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{task.title}</h1>
          </div>
          <div className="flex items-start gap-2">
            {task.points > 0 && (
              <div className="rounded-xl bg-slate-900/5 px-3 py-2.5 text-right">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">积分</div>
                <div className="text-base font-semibold tabular-nums">{task.points}</div>
              </div>
            )}
            {task.reward && (
              <div className="reward-chip rounded-xl px-4 py-2.5 text-right">
                <div className="text-[10px] uppercase tracking-wider opacity-80">奖励</div>
                <div className="text-sm">{task.reward}</div>
              </div>
            )}
            {isAdmin && <AdminTaskMenu taskId={task.id} taskTitle={task.title} />}
          </div>
        </div>

        <div className="mt-6 grid gap-4 border-y border-slate-100 py-4 text-sm sm:grid-cols-3">
          <Meta label="发布人" user={task.creator} />
          <div>
            <div className="mb-1 text-xs uppercase tracking-wider text-slate-400">
              {task.allowMultiClaim ? `领取人（${task.claims.length}）` : '领取人'}
            </div>
            {task.allowMultiClaim ? (
              task.claims.length === 0 ? (
                <span className="text-slate-400">还没有人领取</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {task.claims.map((c) => (
                    <span
                      key={c.id}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ring-1 ${c.userId === me.id ? 'bg-amber-50 text-amber-900 ring-amber-300' : 'bg-slate-100 text-slate-700 ring-slate-200'}`}
                      title={c.user.email ?? ''}
                    >
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-rose-300 to-red-400 text-[9px] font-semibold text-white">
                        {initial(c.user.name ?? c.user.email)}
                      </span>
                      {c.user.name ?? c.user.email}
                      {c.userId === me.id && <span className="text-[10px] opacity-70">（你）</span>}
                    </span>
                  ))}
                </div>
              )
            ) : task.claimant ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-rose-300 to-red-400 text-[10px] font-semibold text-white">
                    {initial(task.claimant.name ?? task.claimant.email)}
                  </div>
                  <span className="truncate">{task.claimant.name ?? task.claimant.email}</span>
                </div>
                {task.claimedAt && (task.status === 'CLAIMED' || task.status === 'SUBMITTED') && (
                  <Countdown since={task.claimedAt.toISOString()} />
                )}
              </div>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </div>
          <div>
            <div className="mb-1 text-xs uppercase tracking-wider text-slate-400">
              {task.deadline && (task.status === 'OPEN' || task.status === 'CLAIMED' || task.status === 'REJECTED') ? '倒计时' : '截止时间'}
            </div>
            {task.deadline ? (
              (task.status === 'OPEN' || task.status === 'CLAIMED' || task.status === 'REJECTED') ? (
                <Countdown deadline={task.deadline.toISOString()} size="md" />
              ) : (
                <span className="font-medium">{fmt(task.deadline)}</span>
              )
            ) : (
              <span className="text-slate-400">无截止</span>
            )}
          </div>
        </div>

        <div className="prose prose-slate mt-6 max-w-none whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700">
          {task.description}
        </div>

        {task.attachments.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">任务附件</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {task.attachments.map((a) => (
                <li key={a.id}>
                  <a href={`/api/attachments/${a.id}`} target="_blank" className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition hover:border-slate-300 hover:bg-slate-50">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100">
                      <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 10-5.656-5.656L5.757 10.586a6 6 0 108.485 8.485L20 13.828" /></svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{a.filename}</div>
                      <div className="text-xs text-slate-500">{(a.size / 1024).toFixed(1)} KB</div>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>

      <TaskActions
        task={{
          id: task.id,
          title: task.title,
          status: task.status,
          claimantId: task.claimantId,
          allowMultiClaim: task.allowMultiClaim,
          myClaimActive,
        }}
        me={{ id: me.id, role: me.role }}
      />

      <section className="rise rise-delay-1">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">提交记录</h2>
          <span className="text-xs text-slate-400">{task.submissions.length} 条</span>
        </div>
        {task.submissions.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 py-10 text-center text-sm text-slate-500">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
              <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
            </div>
            还没有提交
          </div>
        ) : (
          <ul className="space-y-4">
            {task.submissions.map((s) => (
              <li key={s.id} className="card p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-400 text-xs font-semibold text-white">
                      {initial(s.user.name ?? s.user.email)}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{s.user.name ?? s.user.email}</div>
                      <div className="text-xs text-slate-400">{fmt(s.createdAt)}</div>
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{s.note}</div>
                {s.attachments.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {s.attachments.map((a) => (
                      <li key={a.id}>
                        <a href={`/api/attachments/${a.id}`} target="_blank" className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 10-5.656-5.656L5.757 10.586a6 6 0 108.485 8.485L20 13.828" /></svg>
                          {a.filename}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {s.reviewNote && (
                  <div className={`mt-4 rounded-xl p-3.5 text-sm ${s.status === 'APPROVED' ? 'bg-emerald-50 ring-1 ring-emerald-200' : s.status === 'REJECTED' ? 'bg-rose-50 ring-1 ring-rose-200' : 'bg-slate-50 ring-1 ring-slate-200'}`}>
                    <div className="mb-1 flex items-center gap-2 text-xs">
                      <span className="font-medium">{s.status === 'APPROVED' ? '✓ 通过' : s.status === 'REJECTED' ? '× 驳回' : '审核意见'}</span>
                      <span className="text-slate-500">· {s.reviewer?.name ?? s.reviewer?.email} · {fmt(s.reviewedAt)}</span>
                    </div>
                    <div className="text-slate-700">{s.reviewNote}</div>
                  </div>
                )}
                {isAdmin && s.status === 'PENDING' && (
                  <ReviewFormClient
                    submissionId={s.id}
                    submitterId={s.user.id}
                    meId={me.id}
                    suggestedPenaltyPoints={Math.max(1, (task.points ?? 0) * 2)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {task.penalties.length > 0 && (
        <section className="rise rise-delay-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-rose-800">⚠️ 失败 / 扣罚记录</h2>
            {isAdmin && (
              <Link href="/admin/penalties" className="text-xs text-slate-500 hover:text-slate-900">
                前往扣罚管理 →
              </Link>
            )}
          </div>
          <ul className="space-y-3">
            {task.penalties.map((p) => (
              <li key={p.id} className={`card p-4 sm:p-5 ${p.status === 'REVOKED' ? 'opacity-70' : 'ring-1 ring-rose-200'}`}>
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-red-600 text-xs font-semibold text-white">
                    {initial(p.user.name ?? p.user.email)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{p.user.name ?? p.user.email}</span>
                      {p.status === 'ACTIVE' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700 ring-1 ring-rose-200">
                          扣 {p.points} 分
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                          已撤销
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 whitespace-pre-wrap text-sm text-slate-700">{p.reason}</div>
                    <div className="mt-1.5 text-xs text-slate-500">
                      {p.issuedBy?.name ?? p.issuedBy?.email ?? '—'} · {fmt(p.createdAt)}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {task.rewards.length > 0 && (
        <section className="rise rise-delay-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">🎁 奖励发放记录</h2>
            {isAdmin && (
              <Link href="/admin/rewards" className="text-xs text-slate-500 hover:text-slate-900">
                前往奖励发放管理 →
              </Link>
            )}
          </div>
          <ul className="space-y-3">
            {task.rewards.map((r) => {
              const statusMeta: Record<string, { label: string; cls: string; dot: string }> = {
                PENDING:      { label: '待发放',  cls: 'bg-amber-50 text-amber-800 ring-amber-200',     dot: 'bg-amber-500' },
                ISSUED:       { label: '已发放',  cls: 'bg-sky-50 text-sky-700 ring-sky-200',           dot: 'bg-sky-500' },
                ACKNOWLEDGED: { label: '已确认',  cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
                DISPUTED:     { label: '有异议',  cls: 'bg-rose-50 text-rose-700 ring-rose-200',         dot: 'bg-rose-500' },
                CANCELLED:    { label: '已取消',  cls: 'bg-slate-100 text-slate-500 ring-slate-200',     dot: 'bg-slate-400' },
              };
              const meta = statusMeta[r.status] ?? statusMeta.PENDING;
              const methodLabel: Record<string, string> = {
                CASH: '现金', TRANSFER: '转账', VOUCHER: '代金券', IN_KIND: '实物', POINTS_ONLY: '仅积分', OTHER: '其他',
              };
              return (
                <li key={r.id} className="card p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-300 to-red-400 text-xs font-semibold text-white">
                        {initial(r.recipient.name ?? r.recipient.email)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{r.recipient.name ?? r.recipient.email}</span>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ${meta.cls}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                            {meta.label}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-700">
                          {r.rewardText && <span>🎁 <strong>{r.rewardText}</strong></span>}
                          {r.points > 0 && <span className="text-slate-500">{r.points} 积分</span>}
                          <span className="text-xs text-slate-500">· {methodLabel[r.method] ?? r.method}</span>
                        </div>
                        {r.issuedAt && (
                          <div className="mt-1 text-xs text-slate-500">
                            由 {r.issuedBy?.name ?? r.issuedBy?.email ?? '管理员'} 于 {fmt(r.issuedAt)} 标记已发放
                          </div>
                        )}
                        {r.acknowledgedAt && (
                          <div className="mt-0.5 text-xs text-emerald-700">
                            收款人于 {fmt(r.acknowledgedAt)} 确认收到
                          </div>
                        )}
                        {r.note && (
                          <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-100">
                            {r.note}
                          </div>
                        )}
                        {r.receipts.length > 0 && (
                          <ul className="mt-2 flex flex-wrap gap-2">
                            {r.receipts.map((a) => (
                              <li key={a.id}>
                                <a href={`/api/attachments/${a.id}`} target="_blank" className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200">
                                  📎 {a.filename}
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function Meta({ label, user, raw, empty }: {
  label: string;
  user?: { name: string | null; email: string } | null;
  raw?: string;
  empty?: string;
}) {
  if (raw !== undefined) {
    return (
      <div>
        <div className="mb-1 text-xs uppercase tracking-wider text-slate-400">{label}</div>
        <div className="font-medium">{raw}</div>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wider text-slate-400">{label}</div>
      {user ? (
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
            {(user.name ?? user.email ?? '?').slice(0, 1).toUpperCase()}
          </div>
          <span className="truncate">{user.name ?? user.email}</span>
        </div>
      ) : (
        <span className="text-slate-400">{empty ?? '—'}</span>
      )}
    </div>
  );
}
