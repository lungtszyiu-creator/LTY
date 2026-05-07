/**
 * 法务需求表单 —— LTY 和 MC 共用，create/update 通过 action prop 传入
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';
import {
  type LegalRequestRow,
  LEGAL_CATEGORY_OPTIONS,
  LEGAL_PRIORITY_OPTIONS,
} from '@/lib/legal-shared';

const STATUS_OPTIONS = [
  { value: 'OPEN', label: '待处理' },
  { value: 'IN_PROGRESS', label: '进行中' },
  { value: 'RESOLVED', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' },
];

export async function LegalRequestForm({
  mode,
  initial,
  action,
  cancelHref,
}: {
  mode: 'create' | 'edit';
  initial?: LegalRequestRow;
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
      <Field label="标题" required>
        <input
          name="title"
          type="text"
          defaultValue={initial?.title ?? ''}
          required
          maxLength={200}
          placeholder="如：审 MC Markets 用户协议 v3"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="类型">
          <select
            name="category"
            defaultValue={initial?.category ?? ''}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="">— 未指定 —</option>
            {LEGAL_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="优先级" required>
          <select
            name="priority"
            defaultValue={initial?.priority ?? 'NORMAL'}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            {LEGAL_PRIORITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="负责人">
          <select
            name="assigneeId"
            defaultValue={initial?.assignee?.id ?? ''}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="">— 未指定（待分配）—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
            ))}
          </select>
        </Field>
        {mode === 'edit' && (
          <Field label="状态" required>
            <select
              name="status"
              defaultValue={initial?.status ?? 'OPEN'}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <Field label="详细描述">
        <textarea
          name="description"
          rows={4}
          defaultValue={initial?.description ?? ''}
          maxLength={4000}
          placeholder="背景、目的、关联合同 / 链接 / 相关方…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </Field>

      {mode === 'edit' && (
        <Field label="处理结果" hint="状态改成「已完成」或「已取消」时填写">
          <textarea
            name="resolutionNote"
            rows={3}
            defaultValue={initial?.resolutionNote ?? ''}
            maxLength={2000}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </Field>
      )}

      <Field label="备注">
        <textarea
          name="notes"
          rows={2}
          defaultValue={initial?.notes ?? ''}
          maxLength={2000}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700"
        >
          {mode === 'create' ? '创建需求' : '保存修改'}
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
