import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireDeptView } from '@/lib/dept-access';
import {
  type LegalRequestRow,
  LEGAL_CATEGORY_LABEL,
  LEGAL_PRIORITY_META,
  LEGAL_STATUS_META,
} from '@/lib/legal-shared';
import { LegalRequestForm } from '@/components/legal/LegalRequestForm';
import { ConfirmDeleteForm } from '@/app/dept/admin/_components/ConfirmDeleteForm';
import { updateMcLegalRequest, deleteMcLegalRequest } from '../../_actions';

export const dynamic = 'force-dynamic';

export default async function McLegalRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireDeptView('mc-legal');
  const { id } = await params;
  const r = await prisma.mcLegalRequest.findUnique({
    where: { id },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
  });
  if (!r) notFound();

  const initial: LegalRequestRow = {
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    priority: r.priority,
    status: r.status,
    requester: r.requester,
    assignee: r.assignee,
    resolvedAt: r.resolvedAt,
    resolutionNote: r.resolutionNote,
    notes: r.notes,
    vaultPath: r.vaultPath,
    createdByAi: r.createdByAi,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };

  const sm = LEGAL_STATUS_META[r.status] ?? LEGAL_STATUS_META.OPEN;
  const pm = LEGAL_PRIORITY_META[r.priority] ?? LEGAL_PRIORITY_META.NORMAL;
  const canEdit = ctx.level === 'LEAD' || ctx.isSuperAdmin;
  const updateAction = updateMcLegalRequest.bind(null, r.id);
  const deleteAction = deleteMcLegalRequest.bind(null, r.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-baseline justify-between">
        <Link href="/dept/mc-legal" className="text-sm text-slate-500 hover:text-slate-800">
          ← 返回 MC 法务
        </Link>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${sm.cls}`}>{sm.label}</span>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{r.title}</h1>
        <div className="mt-1 flex flex-wrap items-baseline gap-3 text-sm text-slate-500">
          {r.category && <span>{LEGAL_CATEGORY_LABEL[r.category] ?? r.category}</span>}
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${pm.cls}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${pm.dot}`} />
            {pm.label}
          </span>
          <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700 ring-1 ring-purple-200">
            🔒 MC 隔离
          </span>
        </div>
      </header>

      {r.description && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">详细描述</div>
          <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">{r.description}</pre>
        </section>
      )}

      <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <dl className="divide-y divide-slate-200/60">
          <Row label="发起人">
            {r.requester ? r.requester.name ?? r.requester.email : '—'}{' '}
            <span className="text-xs text-slate-400">
              · {r.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
            </span>
          </Row>
          <Row label="负责人">{r.assignee ? r.assignee.name ?? r.assignee.email : '— 未分配 —'}</Row>
          {r.resolvedAt && (
            <Row label="处理时间">{r.resolvedAt.toISOString().slice(0, 16).replace('T', ' ')}</Row>
          )}
          {r.resolutionNote && (
            <Row label="处理结果">
              <pre className="whitespace-pre-wrap font-sans text-sm text-slate-600">{r.resolutionNote}</pre>
            </Row>
          )}
          {r.notes && (
            <Row label="备注">
              <pre className="whitespace-pre-wrap font-sans text-sm text-slate-600">{r.notes}</pre>
            </Row>
          )}
        </dl>
      </section>

      {canEdit ? (
        <section className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-600">编辑 / 处理</h2>
          <LegalRequestForm
            mode="edit"
            initial={initial}
            action={updateAction}
            cancelHref={`/dept/mc-legal/requests/${r.id}`}
          />
          {ctx.isSuperAdmin && (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <ConfirmDeleteForm
                action={deleteAction}
                message={`永久删除 MC 法务需求「${r.title}」？\n该操作不可恢复。`}
              >
                <button
                  type="submit"
                  className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                >
                  🗑️ 永久删除（仅总管）
                </button>
              </ConfirmDeleteForm>
            </div>
          )}
        </section>
      ) : (
        <div className="rounded-xl border border-sky-200/60 bg-sky-50/40 p-4 text-xs text-sky-900">
          👁 你是部门成员，只能查看，无法处理。
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 text-sm sm:grid sm:grid-cols-[140px_1fr] sm:gap-4">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-500 sm:text-sm sm:normal-case sm:tracking-normal">
        {label}
      </dt>
      <dd className="min-w-0 text-slate-900">{children}</dd>
    </div>
  );
}
