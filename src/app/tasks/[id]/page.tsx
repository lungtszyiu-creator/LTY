import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import StatusBadge from '@/components/StatusBadge';
import TaskActions from './TaskActions';
import ReviewFormClient from './ReviewFormClient';

export const dynamic = 'force-dynamic';

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
  const isClaimant = task.claimantId === me.id;

  return (
    <div className="space-y-6">
      <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">← 返回看板</Link>

      <div className="rounded-xl border bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <h1 className="text-xl font-semibold">{task.title}</h1>
              <StatusBadge status={task.status} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>发布人：{task.creator.name ?? task.creator.email}</span>
              {task.claimant && <span>领取人：{task.claimant.name ?? task.claimant.email}</span>}
              {task.deadline && <span>截止：{new Date(task.deadline).toLocaleString('zh-CN')}</span>}
              <span>创建于：{new Date(task.createdAt).toLocaleString('zh-CN')}</span>
            </div>
          </div>
          {task.reward && (
            <div className="rounded-lg bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700">
              奖励：{task.reward}
            </div>
          )}
        </div>

        <div className="prose prose-slate mt-6 max-w-none whitespace-pre-wrap text-sm leading-relaxed">
          {task.description}
        </div>

        {task.attachments.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-medium text-slate-700">任务附件</h3>
            <ul className="space-y-1 text-sm">
              {task.attachments.map((a) => (
                <li key={a.id}>
                  <a href={`/api/attachments/${a.id}`} target="_blank" className="text-blue-600 hover:underline">
                    {a.filename}
                  </a>
                  <span className="ml-2 text-xs text-slate-500">({(a.size / 1024).toFixed(1)} KB)</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <TaskActions
        task={{
          id: task.id,
          status: task.status,
          claimantId: task.claimantId,
        }}
        me={{ id: me.id, role: me.role }}
      />

      <section>
        <h2 className="mb-3 text-lg font-semibold">提交记录</h2>
        {task.submissions.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-white p-6 text-center text-sm text-slate-500">
            还没有提交
          </div>
        ) : (
          <ul className="space-y-4">
            {task.submissions.map((s) => (
              <li key={s.id} className="rounded-xl border bg-white p-5">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm text-slate-600">
                    {s.user.name ?? s.user.email} · {new Date(s.createdAt).toLocaleString('zh-CN')}
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                <div className="whitespace-pre-wrap text-sm">{s.note}</div>
                {s.attachments.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm">
                    {s.attachments.map((a) => (
                      <li key={a.id}>
                        <a href={`/api/attachments/${a.id}`} target="_blank" className="text-blue-600 hover:underline">
                          {a.filename}
                        </a>
                        <span className="ml-2 text-xs text-slate-500">({(a.size / 1024).toFixed(1)} KB)</span>
                      </li>
                    ))}
                  </ul>
                )}
                {s.reviewNote && (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                    <div className="mb-1 text-xs text-slate-500">
                      审核意见 · {s.reviewer?.name ?? s.reviewer?.email ?? ''} · {s.reviewedAt && new Date(s.reviewedAt).toLocaleString('zh-CN')}
                    </div>
                    <div>{s.reviewNote}</div>
                  </div>
                )}
                {isAdmin && s.status === 'PENDING' && (
                  <ReviewFormClient submissionId={s.id} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
