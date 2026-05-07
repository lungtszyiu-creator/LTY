/**
 * 资产详情 + 编辑 (/dept/admin/assets/[id])
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireDeptView } from '@/lib/dept-access';
import { AssetForm } from '../../_components/AssetForm';
import { ConfirmDeleteForm } from '../../_components/ConfirmDeleteForm';
import { updateAsset, deleteAsset } from '../../_actions';

export const dynamic = 'force-dynamic';

const CATEGORY_LABEL: Record<string, string> = {
  OFFICE_EQUIPMENT: '办公设备',
  FURNITURE: '家具',
  ELECTRONICS: '电子设备',
  OTHER: '其它',
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  IN_USE: { label: '在用', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  IDLE: { label: '闲置', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  RETIRED: { label: '报废', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
  LOST: { label: '丢失', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireDeptView('admin');
  const { id } = await params;
  const asset = await prisma.adminFixedAsset.findUnique({
    where: { id },
    include: {
      responsible: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!asset) notFound();

  const meta = STATUS_META[asset.status] ?? STATUS_META.IN_USE;
  const canEdit = ctx.level === 'LEAD' || ctx.isSuperAdmin;
  const updateAction = updateAsset.bind(null, asset.id);
  const deleteAction = deleteAsset.bind(null, asset.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-baseline justify-between">
        <Link href="/dept/admin?tab=assets" className="text-sm text-slate-500 hover:text-slate-800">
          ← 返回行政部 · 资产
        </Link>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${meta.cls}`}>{meta.label}</span>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{asset.name}</h1>
        <div className="mt-1 flex flex-wrap items-baseline gap-3 text-sm text-slate-500">
          <span>{CATEGORY_LABEL[asset.category] ?? asset.category}</span>
          {asset.assetCode && (
            <>
              <span>·</span>
              <span className="font-mono">{asset.assetCode}</span>
            </>
          )}
        </div>
      </header>

      <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <dl className="divide-y divide-slate-200/60">
          <Row label="位置">{asset.location ?? '—'}</Row>
          <Row label="责任人">
            {asset.responsible ? asset.responsible.name ?? asset.responsible.email : '—'}
          </Row>
          <Row label="购入日期">
            {asset.purchasedAt ? asset.purchasedAt.toISOString().slice(0, 10) : '—'}
          </Row>
          <Row label="购入价格">
            {asset.purchasePrice
              ? `${asset.purchasePrice.toString()} ${asset.currency ?? 'HKD'}`
              : '—'}
          </Row>
          {asset.notes && (
            <Row label="备注">
              <pre className="whitespace-pre-wrap font-sans text-sm text-slate-600">{asset.notes}</pre>
            </Row>
          )}
          <Row label="创建">
            {asset.createdByAi
              ? `🤖 ${asset.createdByAi}`
              : asset.createdBy?.name ?? asset.createdBy?.email ?? '人工'}{' '}
            <span className="text-xs text-slate-400">
              · {asset.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
            </span>
          </Row>
        </dl>
      </section>

      {canEdit ? (
        <section className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-600">编辑</h2>
          <AssetForm
            mode="edit"
            initial={{
              id: asset.id,
              name: asset.name,
              category: asset.category,
              location: asset.location,
              purchasedAt: asset.purchasedAt,
              purchasePrice: asset.purchasePrice,
              currency: asset.currency,
              status: asset.status,
              responsibleId: asset.responsibleId,
              notes: asset.notes,
            }}
            action={updateAction}
            cancelHref={`/dept/admin/assets/${asset.id}`}
          />
          {ctx.isSuperAdmin && (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <ConfirmDeleteForm
                action={deleteAction}
                message={`永久删除资产「${asset.name}」？\n该操作不可恢复。`}
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
          👁 你是部门成员，只能查看，无法编辑。
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
