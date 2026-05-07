/**
 * 共用证照表单组件 —— 新建（mode='create'）+ 编辑（mode='edit'）
 *
 * server action 通过 props 传入。表单失败 throw → Next.js 错误边界处理。
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'BUSINESS_LICENSE', label: '营业执照' },
  { value: 'CONTRACT', label: '合同' },
  { value: 'QUALIFICATION', label: '资质' },
  { value: 'CERTIFICATE', label: '证书' },
  { value: 'OTHER', label: '其它' },
];

type LicenseInitial = {
  id?: string;
  type: string;
  name: string;
  identifier: string | null;
  issuedAt: Date | null;
  expireAt: Date | null;
  responsibleId: string | null;
  notes: string | null;
  status?: string;
};

function dateInputValue(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : '';
}

export async function LicenseForm({
  mode,
  initial,
  action,
  cancelHref,
  isSuperAdmin = false,
}: {
  mode: 'create' | 'edit';
  initial?: LicenseInitial;
  action: (formData: FormData) => Promise<void>;
  cancelHref: string;
  isSuperAdmin?: boolean;
}) {
  // 责任人下拉：仅 active 用户
  const users = await prisma.user.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true },
  });

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="类型" required>
          <select
            name="type"
            defaultValue={initial?.type ?? 'BUSINESS_LICENSE'}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="名称 / 对方" required>
          <input
            name="name"
            type="text"
            defaultValue={initial?.name ?? ''}
            required
            maxLength={200}
            placeholder="如：旭珑（深圳）有限公司 营业执照"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </Field>
        <Field label="证号 / 合同编号">
          <input
            name="identifier"
            type="text"
            defaultValue={initial?.identifier ?? ''}
            maxLength={200}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
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
        <Field label="签发日期">
          <input
            name="issuedAt"
            type="date"
            defaultValue={dateInputValue(initial?.issuedAt)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </Field>
        <Field label="到期日期" hint="留空 = 永久有效">
          <input
            name="expireAt"
            type="date"
            defaultValue={dateInputValue(initial?.expireAt)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
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
      {mode === 'edit' && (
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" name="archive" defaultChecked={initial?.status === 'ARCHIVED'} />
          归档（不再参与到期监控）
        </label>
      )}
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
      {mode === 'edit' && isSuperAdmin && (
        <div className="mt-4 border-t border-slate-200 pt-4 text-xs text-slate-500">
          仅总管：永久删除按钮在详情页 → 老板操作区。
        </div>
      )}
    </form>
  );
}

function Field({
  label,
  required = false,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
        {hint && <span className="ml-2 font-normal text-slate-400">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
