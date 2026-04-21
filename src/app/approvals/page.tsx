import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { hasMinRole, type Role } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { APPROVAL_CATEGORY_META } from '@/lib/approvalFlow';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'pending', label: '待我审批' },
  { key: 'mine',    label: '我发起的' },
  { key: 'cc',      label: '抄送给我' },
  { key: 'all',     label: '全部' },
] as const;

type TabKey = typeof TABS[number]['key'];

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: { tab?: TabKey };
}) {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const tab: TabKey = (searchParams.tab && TABS.some((t) => t.key === searchParams.tab)) ? searchParams.tab! : 'pending';
  const me = session.user;
  const isAdmin = hasMinRole(me.role as Role, 'ADMIN');

  const where: any = {};
  if (tab === 'mine') where.initiatorId = me.id;
  else if (tab === 'pending') {
    where.status = 'IN_PROGRESS';
    where.steps = { some: { approverId: me.id, decision: null, kind: 'APPROVAL', superseded: false } };
  } else if (tab === 'cc') {
    where.steps = { some: { approverId: me.id, kind: 'CC' } };
  } else if (tab === 'all') {
    if (!isAdmin) {
      where.OR = [{ initiatorId: me.id }, { steps: { some: { approverId: me.id } } }];
    }
  }

  const [items, pendingCount] = await Promise.all([
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
      orderBy: { submittedAt: 'desc' },
      take: 100,
    }),
    prisma.approvalInstance.count({
      where: {
        status: 'IN_PROGRESS',
        steps: { some: { approverId: me.id, decision: null, kind: 'APPROVAL', superseded: false } },
      },
    }),
  ]);

  return (
    <div className="pt-6 sm:pt-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 rise sm:mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">📋 审批中心</h1>
          <p className="mt-1 text-sm text-slate-500">
            可视化拖拽自定义流程 · 请假 / 报销 / 出差 / 采购 等都在这里。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link href="/admin/approvals/templates" className="btn btn-ghost text-xs">管理模板</Link>
          )}
          <Link href="/approvals/new" className="btn btn-primary">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
            发起审批
          </Link>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2 rise rise-delay-1">
        {TABS.map((t) => {
          const active = t.key === tab;
          const showCount = t.key === 'pending' && pendingCount > 0;
          return (
            <Link
              key={t.key}
              href={`/approvals?tab=${t.key}`}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition ${
                active ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t.label}
              {showCount && (
                <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${active ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-700'}`}>
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {items.length === 0 ? (
        <div className="card py-14 text-center text-sm text-slate-500 rise rise-delay-2">
          {tab === 'pending' ? '🎉 没有待你审批的事项' :
           tab === 'mine' ? '你还没有发起过审批。去"发起审批"看看？' :
           tab === 'cc' ? '还没有抄送给你的审批' :
           '还没有审批记录'}
        </div>
      ) : (
        <ul className="space-y-3 rise rise-delay-2">
          {items.map((i) => {
            const catMeta = APPROVAL_CATEGORY_META[i.template.category] ?? APPROVAL_CATEGORY_META.OTHER;
            const myPending = i.steps.find((s) => s.approverId === me.id && !s.decision && !s.superseded && s.kind === 'APPROVAL');
            const statusMeta: Record<string, { label: string; cls: string }> = {
              IN_PROGRESS: { label: '审批中', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
              APPROVED:    { label: '✓ 已通过', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
              REJECTED:    { label: '× 已驳回', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
              CANCELLED:   { label: '已撤销', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
            };
            const sm = statusMeta[i.status] ?? statusMeta.IN_PROGRESS;
            return (
              <li key={i.id}>
                <Link href={`/approvals/${i.id}`} className="card lift block p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="text-lg">{i.template.icon ?? catMeta.icon}</span>
                        <span className="text-xs text-slate-500">{catMeta.label}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ${sm.cls}`}>{sm.label}</span>
                        {myPending && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700 ring-1 ring-rose-200">⏰ 待你审批</span>
                        )}
                      </div>
                      <h3 className="line-clamp-1 text-base font-semibold">{i.title}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                        <span>发起人：{i.initiator.name ?? i.initiator.email}</span>
                        <span>· {new Date(i.submittedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
