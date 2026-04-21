import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { hasMinRole, type Role } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { parseFields, parseFlow, APPROVAL_CATEGORY_META, FIELD_TYPE_META } from '@/lib/approvalFlow';
import { fmtDateTime } from '@/lib/datetime';
import InstanceActions from './InstanceActions';

export const dynamic = 'force-dynamic';

function fmt(d: Date | null | undefined) {
  return fmtDateTime(d);
}

function initial(s: string | null | undefined) {
  return (s || '?').slice(0, 1).toUpperCase();
}

export default async function ApprovalInstancePage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  const me = session.user;
  const isAdmin = hasMinRole(me.role as Role, 'ADMIN');

  const inst = await prisma.approvalInstance.findUnique({
    where: { id: params.id },
    include: {
      template: true,
      initiator: { select: { id: true, name: true, email: true, image: true } },
      attachments: true,
      steps: {
        include: { approver: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!inst) notFound();

  const involvesMe = inst.initiatorId === me.id || inst.steps.some((s) => s.approverId === me.id);
  if (!isAdmin && !involvesMe) {
    return (
      <div className="pt-8">
        <div className="card p-10 text-center text-sm text-slate-500">你没有查看这条审批的权限</div>
      </div>
    );
  }

  const flow = parseFlow(inst.flowSnapshot);
  const fields = parseFields(inst.fieldsSnapshot);
  const form: Record<string, any> = JSON.parse(inst.formJson || '{}');

  const catMeta = APPROVAL_CATEGORY_META[inst.template.category] ?? APPROVAL_CATEGORY_META.OTHER;

  // Build per-node visual timeline
  const approvalNodeIds = flow.nodes.filter((n) => n.type === 'approval' || n.type === 'cc').map((n) => n.id);
  const stepsByNode = new Map<string, typeof inst.steps>();
  for (const s of inst.steps) {
    if (!stepsByNode.has(s.nodeId)) stepsByNode.set(s.nodeId, []);
    stepsByNode.get(s.nodeId)!.push(s);
  }

  const myPendingStep = inst.status === 'IN_PROGRESS'
    ? inst.steps.find((s) => s.approverId === me.id && !s.decision && !s.superseded && s.kind === 'APPROVAL')
    : null;

  const statusMeta: Record<string, { label: string; cls: string }> = {
    IN_PROGRESS: { label: '审批中', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
    APPROVED:    { label: '✓ 已通过', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    REJECTED:    { label: '× 已驳回', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
    CANCELLED:   { label: '已撤销', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
  };
  const sm = statusMeta[inst.status] ?? statusMeta.IN_PROGRESS;

  return (
    <div className="space-y-6 pt-6 sm:pt-8">
      <Link href="/approvals" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        ← 返回审批中心
      </Link>

      <article className="card overflow-hidden p-5 sm:p-7">
        <div className="accent-bar absolute inset-x-0 top-0 h-1 opacity-80" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ${sm.cls}`}>{sm.label}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200">
                {inst.template.icon ?? catMeta.icon} {catMeta.label}
              </span>
              <span className="text-xs text-slate-500">发起于 {fmt(inst.submittedAt)}</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{inst.title}</h1>
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-200 to-rose-200 text-[10px] font-semibold text-amber-900">
                {initial(inst.initiator.name ?? inst.initiator.email)}
              </span>
              <span>{inst.initiator.name ?? inst.initiator.email}</span>
            </div>
          </div>
          {inst.status === 'IN_PROGRESS' && inst.initiatorId === me.id && (
            <form action={`/api/approvals/${inst.id}`} method="POST" onSubmit={(e) => { e.preventDefault(); if (!confirm('撤销这条审批？')) return; fetch(`/api/approvals/${inst.id}`, { method: 'DELETE' }).then(() => location.reload()); }}>
              <button type="submit" className="btn btn-ghost text-xs text-rose-600">撤销</button>
            </form>
          )}
        </div>
      </article>

      {/* Form data — render from fieldsSnapshot; if any raw form values don't
          map to a known field (e.g. template edited after submit), still show
          them below so nothing silently disappears. */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">📝 表单内容</h2>
        <div className="card divide-y divide-slate-100">
          {fields.length === 0 && Object.keys(form).length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              此模板没有表单字段
            </div>
          )}
          {fields.map((f) => {
            const v = form[f.id];
            let display: any = <span className="text-slate-400">未填写</span>;
            if (v !== undefined && v !== null && v !== '') {
              if (f.type === 'daterange' && Array.isArray(v)) display = `${v[0]} 至 ${v[1]}`;
              else if (f.type === 'multiselect' && Array.isArray(v)) display = v.join('、');
              else if (f.type === 'money') display = `¥ ${v}`;
              else display = String(v);
            }
            return (
              <div key={f.id} className="flex items-start gap-4 px-4 py-3 text-sm sm:px-5">
                <div className="w-28 shrink-0 text-xs font-medium text-slate-500">
                  {FIELD_TYPE_META[f.type]?.icon} {f.label}
                </div>
                <div className="min-w-0 flex-1 whitespace-pre-wrap text-slate-800">{display}</div>
              </div>
            );
          })}
          {/* Orphan values: keys in form that aren't described by fields */}
          {Object.keys(form).filter((k) => !fields.some((f) => f.id === k)).map((k) => (
            <div key={`orphan-${k}`} className="flex items-start gap-4 px-4 py-3 text-sm sm:px-5 opacity-70">
              <div className="w-28 shrink-0 text-xs text-slate-400">
                附加
              </div>
              <div className="min-w-0 flex-1 whitespace-pre-wrap text-slate-800">
                {typeof form[k] === 'object' ? JSON.stringify(form[k]) : String(form[k])}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Timeline by node */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">🧭 审批流程</h2>
        <ol className="space-y-3">
          {/* Initiator */}
          <li className="card p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm text-sky-700">🚀</div>
              <div>
                <div className="text-sm font-medium">发起</div>
                <div className="mt-0.5 text-xs text-slate-500">{inst.initiator.name ?? inst.initiator.email} · {fmt(inst.submittedAt)}</div>
              </div>
            </div>
          </li>

          {approvalNodeIds.map((nid) => {
            const node = flow.nodes.find((n) => n.id === nid)!;
            const steps = stepsByNode.get(nid) ?? [];
            const isCurrent = inst.currentNodeId === nid;
            const isCc = node.type === 'cc';
            return (
              <li key={nid} className={`card p-4 ${isCurrent ? 'ring-2 ring-amber-300' : ''}`}>
                <div className="mb-2 flex items-start gap-3">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${isCc ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                    {isCc ? '📨' : '👤'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {node.data.label || (isCc ? '抄送' : '审批')}
                      {!isCc && node.data.mode && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                          {node.data.mode === 'ANY' ? '或签' : '会签'}
                        </span>
                      )}
                      {isCurrent && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-900">当前</span>}
                    </div>
                  </div>
                </div>
                <ul className="space-y-1.5 pl-11">
                  {steps.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 text-xs">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-rose-300 to-red-400 text-[9px] font-semibold text-white">
                        {initial(s.approver?.name ?? s.approver?.email)}
                      </span>
                      <span>{s.approver?.name ?? s.approver?.email}</span>
                      {s.decision === 'APPROVED' ? (
                        <span className="text-emerald-700">✓ 通过 {fmt(s.decidedAt)}</span>
                      ) : s.decision === 'REJECTED' ? (
                        <span className="text-rose-700">× 驳回 {fmt(s.decidedAt)}</span>
                      ) : s.superseded ? (
                        <span className="text-slate-400">（已跳过）</span>
                      ) : (
                        <span className="text-slate-500">待处理…</span>
                      )}
                      {s.note && <span className="text-slate-500">· {s.note}</span>}
                    </li>
                  ))}
                  {steps.length === 0 && !isCurrent && inst.status === 'IN_PROGRESS' && (
                    <li className="text-xs text-slate-400">等待前置节点完成…</li>
                  )}
                </ul>
              </li>
            );
          })}

          {/* End state */}
          {inst.status !== 'IN_PROGRESS' && (
            <li className="card p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm">🏁</div>
                <div>
                  <div className="text-sm font-medium">{sm.label}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{fmt(inst.completedAt)}</div>
                </div>
              </div>
            </li>
          )}
        </ol>
      </section>

      {myPendingStep && (
        <InstanceActions instanceId={inst.id} stepId={myPendingStep.id} />
      )}
    </div>
  );
}
