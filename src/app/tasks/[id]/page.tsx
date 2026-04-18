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
    },
  });
  if (!task) notFound();

  const me = session.user;
  const isAdmin = me.role === 'ADMIN';

  return (
    <div className="space-y-6 pt-8">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-800">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" /></svg>
        返回看板
      </Link>

      <article className="card rise relative overflow-hidden p-7">
        <div className="accent-bar absolute inset-x-0 top-0 h-1 opacity-80" />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
              <ContributionBadge contribution={task.contribution} />
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
            <div className="mb-1 text-xs uppercase tracking-wider text-slate-400">领取人</div>
            {task.claimant ? (
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
        task={{ id: task.id, title: task.title, status: task.status, claimantId: task.claimantId }}
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
                {isAdmin && s.status === 'PENDING' && <ReviewFormClient submissionId={s.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>
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
