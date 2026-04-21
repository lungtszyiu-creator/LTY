import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { hasMinRole, type Role } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { APPROVAL_CATEGORY_META } from '@/lib/approvalFlow';
import { fmtDateTime } from '@/lib/datetime';
import AdminApprovalsClient from './AdminApprovalsClient';

export const dynamic = 'force-dynamic';

const STATUS_FILTERS = [
  { key: 'IN_PROGRESS', label: '审批中', color: 'sky' },
  { key: 'APPROVED',    label: '已通过', color: 'emerald' },
  { key: 'REJECTED',    label: '已驳回', color: 'rose' },
  { key: 'CANCELLED',   label: '已撤销', color: 'slate' },
  { key: 'all',         label: '全部',   color: 'slate' },
] as const;

export default async function AdminApprovalsPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  if (!hasMinRole(session.user.role as Role, 'ADMIN')) redirect('/dashboard');

  const status = searchParams.status ?? 'IN_PROGRESS';
  const q = (searchParams.q ?? '').trim();

  const where: any = {};
  if (status !== 'all') where.status = status;
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { initiator: { name: { contains: q } } },
      { initiator: { email: { contains: q } } },
      { template: { name: { contains: q } } },
    ];
  }

  const [items, counts] = await Promise.all([
    prisma.approvalInstance.findMany({
      where,
      include: {
        template: { select: { id: true, name: true, icon: true, category: true } },
        initiator: { select: { id: true, name: true, email: true, image: true } },
        steps: {
          include: { approver: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ status: 'asc' }, { submittedAt: 'desc' }],
      take: 200,
    }),
    prisma.approvalInstance.groupBy({ by: ['status'], _count: true }),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));

  return (
    <div className="pt-6 sm:pt-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 rise sm:mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">🗂 审批后台</h1>
          <p className="mt-1 text-sm text-slate-500">
            全公司所有审批实例汇总 · 管理员可直接进入后台审批 / 强制通过 / 驳回。
          </p>
        </div>
        <Link href="/admin/approvals/templates" className="btn btn-ghost text-xs">审批模板</Link>
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2 rise rise-delay-1">
        {STATUS_FILTERS.map((f) => {
          const active = (f.key === 'all' ? status === 'all' : status === f.key);
          const count = f.key === 'all'
            ? Object.values(countMap).reduce((a, b) => (a as number) + (b as number), 0)
            : (countMap[f.key] ?? 0);
          return (
            <a
              key={f.key}
              href={`/admin/approvals?status=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition ${
                active ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f.label}
              <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
                {count}
              </span>
            </a>
          );
        })}
        <input type="hidden" name="status" value={status} />
        <input
          name="q"
          defaultValue={q}
          placeholder="搜索标题 / 发起人 / 模板…"
          className="ml-auto min-w-[240px] flex-1 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
        />
        <button type="submit" className="btn btn-ghost text-xs">搜索</button>
      </form>

      {items.length === 0 ? (
        <div className="card py-14 text-center text-sm text-slate-500 rise rise-delay-2">
          没有匹配的审批记录
        </div>
      ) : (
        <AdminApprovalsClient
          initial={items.map((i) => ({
            id: i.id,
            title: i.title,
            status: i.status,
            submittedAt: i.submittedAt.toISOString(),
            completedAt: i.completedAt?.toISOString() ?? null,
            template: { id: i.template.id, name: i.template.name, icon: i.template.icon, category: i.template.category },
            initiator: { id: i.initiator.id, name: i.initiator.name, email: i.initiator.email ?? '' },
            pendingApprovers: i.steps
              .filter((s) => s.kind === 'APPROVAL' && s.decision === null && !s.superseded)
              .map((s) => s.approver)
              .filter((u): u is NonNullable<typeof u> => !!u)
              .map((u) => ({ id: u.id, name: u.name, email: u.email ?? '' })),
          }))}
          categoryMeta={APPROVAL_CATEGORY_META}
        />
      )}
    </div>
  );
}
