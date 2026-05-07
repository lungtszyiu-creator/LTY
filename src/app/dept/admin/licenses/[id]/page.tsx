/**
 * 证照详情 + 编辑 (/dept/admin/licenses/[id])
 *
 * 详情顶部 = 关键字段卡片；下面是编辑表单（仅 LEAD/SUPER_ADMIN 可改）；
 * 删除按钮仅 SUPER_ADMIN（同凭证删除策略）。
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireDeptView } from '@/lib/dept-access';
import { LicenseForm } from '../../_components/LicenseForm';
import { ConfirmDeleteForm } from '../../_components/ConfirmDeleteForm';
import { updateLicense, deleteLicense } from '../../_actions';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  BUSINESS_LICENSE: '营业执照',
  CONTRACT: '合同',
  QUALIFICATION: '资质',
  CERTIFICATE: '证书',
  OTHER: '其它',
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: '在用', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  EXPIRING: { label: '即将到期', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  EXPIRED: { label: '已过期', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  ARCHIVED: { label: '已归档', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

export default async function LicenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireDeptView('admin');
  const { id } = await params;
  const license = await prisma.adminLicense.findUnique({
    where: { id },
    include: {
      responsible: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!license) notFound();

  const meta = STATUS_META[license.status] ?? STATUS_META.ACTIVE;
  const canEdit = ctx.level === 'LEAD' || ctx.isSuperAdmin;
  const updateAction = updateLicense.bind(null, license.id);
  const deleteAction = deleteLicense.bind(null, license.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-baseline justify-between">
        <Link href="/dept/admin?tab=licenses" className="text-sm text-slate-500 hover:text-slate-800">
          ← 返回行政部 · 证照
        </Link>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${meta.cls}`}>{meta.label}</span>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{license.name}</h1>
        <div className="mt-1 flex flex-wrap items-baseline gap-3 text-sm text-slate-500">
          <span>{TYPE_LABEL[license.type] ?? license.type}</span>
          {license.identifier && (
            <>
              <span>·</span>
              <span className="font-mono">{license.identifier}</span>
            </>
          )}
        </div>
      </header>

      {/* 字段表 */}
      <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <dl className="divide-y divide-slate-200/60">
          <Row label="签发日期">
            {license.issuedAt ? license.issuedAt.toISOString().slice(0, 10) : '—'}
          </Row>
          <Row label="到期日期">
            {license.expireAt ? license.expireAt.toISOString().slice(0, 10) : '永久有效'}
          </Row>
          <Row label="责任人">
            {license.responsible ? license.responsible.name ?? license.responsible.email : '—'}
          </Row>
          {license.notes && (
            <Row label="备注">
              <pre className="whitespace-pre-wrap font-sans text-sm text-slate-600">{license.notes}</pre>
            </Row>
          )}
          {license.vaultPath && (
            <Row label="Vault 路径">
              <code className="break-all rounded bg-slate-100 px-1.5 py-0.5 text-xs">{license.vaultPath}</code>
            </Row>
          )}
          <Row label="创建">
            {license.createdByAi
              ? `🤖 ${license.createdByAi}`
              : license.createdBy?.name ?? license.createdBy?.email ?? '人工'}{' '}
            <span className="text-xs text-slate-400">
              · {license.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
            </span>
          </Row>
        </dl>
      </section>

      {/* 编辑区 */}
      {canEdit ? (
        <section className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-600">编辑</h2>
          <LicenseForm
            mode="edit"
            initial={{
              id: license.id,
              type: license.type,
              name: license.name,
              identifier: license.identifier,
              issuedAt: license.issuedAt,
              expireAt: license.expireAt,
              responsibleId: license.responsibleId,
              notes: license.notes,
              status: license.status,
            }}
            action={updateAction}
            cancelHref={`/dept/admin/licenses/${license.id}`}
            isSuperAdmin={ctx.isSuperAdmin}
          />
          {ctx.isSuperAdmin && (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <ConfirmDeleteForm
                action={deleteAction}
                message={`永久删除证照「${license.name}」？\n该操作不可恢复。`}
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
          👁 你是部门成员，只能查看，无法编辑。需要修改请联系部门负责人或总管。
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
