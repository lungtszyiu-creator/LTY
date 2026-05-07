/**
 * 共用资产表单 —— 新建 + 编辑
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';

const CATEGORY_OPTIONS = [
  { value: 'OFFICE_EQUIPMENT', label: '办公设备' },
  { value: 'FURNITURE', label: '家具' },
  { value: 'ELECTRONICS', label: '电子设备' },
  { value: 'OTHER', label: '其它' },
];

const STATUS_OPTIONS = [
  { value: 'IN_USE', label: '在用' },
  { value: 'IDLE', label: '闲置' },
  { value: 'RETIRED', label: '报废' },
  { value: 'LOST', label: '丢失' },
];

const CURRENCY_OPTIONS = ['HKD', 'USD', 'CNY', 'USDT'];

type AssetInitial = {
  id?: string;
  name: string;
  category: string;
  location: string | null;
  purchasedAt: Date | null;
  purchasePrice: { toString(): string } | null;
  currency: string | null;
  status: string;
  responsibleId: string | null;
  notes: string | null;
};

function dateInputValue(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : '';
}

export async function AssetForm({
  mode,
  initial,
  action,
  cancelHref,
}: {
  mode: 'create' | 'edit';
  initial?: AssetInitial;
  action: (formData: FormData) => Promise<void>;
  cancelHref: string;
}) {
  const users = await prisma.user.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true },
  });

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="名称" required>
          <input
            name="name"
            type="text"
            defaultValue={initial?.name ?? ''}
            required
            maxLength={200}
            placeholder="如：MacBook Pro 14 / 工程师 1 号"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </Field>
        <Field label="类别" required>
          <select
            name="category"
            defaultValue={initial?.category ?? 'OFFICE_EQUIPMENT'}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="位置">
          <input
            name="location"
            type="text"
            defaultValue={initial?.location ?? ''}
            maxLength={200}
            placeholder="如：深圳办公室 工位 12"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </Field>
        <Field label="责任人">
          <select
            name="responsibleId"
            defaultValue={initial?.responsibleId ?? ''}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="">— 未指定 —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
            ))}
          </select>
        </Field>
        <Field label="购入日期">
          <input
            name="purchasedAt"
            type="date"
            defaultValue={dateInputValue(initial?.purchasedAt)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </Field>
        <Field label="购入价格">
          <div className="flex gap-2">
            <input
              name="purchasePrice"
              type="number"
              step="0.01"
              min="0"
              defaultValue={initial?.purchasePrice?.toString() ?? ''}
              placeholder="0.00"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
            />
            <select
              name="currency"
              defaultValue={initial?.currency ?? 'HKD'}
              className="rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </Field>
        <Field label="状态" required>
          <select
            name="status"
            defaultValue={initial?.status ?? 'IN_USE'}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="备注">
        <textarea
          name="notes"
          rows={3}
          defaultValue={initial?.notes ?? ''}
          maxLength={2000}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-amber-700"
        >
          {mode === 'create' ? '创建' : '保存修改'}
        </button>
        <Link
          href={cancelHref}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          取消
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </label>
      {children}
    </div>
  );
}
