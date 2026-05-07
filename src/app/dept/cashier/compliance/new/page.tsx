import Link from 'next/link';
import { requireDeptEdit } from '@/lib/dept-access';
import { createComplianceEntry } from '../../_actions';
import {
  CASHIER_COMPLIANCE_CATEGORY_LABEL,
  CASHIER_DUAL_LAYER_META,
  CASHIER_COMPLIANCE_STATUS_META,
} from '@/lib/cashier-shared';

export const dynamic = 'force-dynamic';

export default async function NewComplianceEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  await requireDeptEdit('cashier');
  const sp = await searchParams;
  const initialCategory = sp.category ?? 'TAX';

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">新增合规台账记录</h1>
        <Link href="/dept/cashier?tab=compliance" className="text-xs text-slate-500 hover:underline">← 返回</Link>
      </header>
      <form action={createComplianceEntry} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="分类" required>
            <select name="category" defaultValue={initialCategory} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              {Object.entries(CASHIER_COMPLIANCE_CATEGORY_LABEL).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="名称" required>
            <input name="name" required maxLength={200} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="编号 / 账号">
            <input name="identifier" maxLength={200} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="周期">
            <select name="cycle" defaultValue="" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="">— 不周期 —</option>
              <option value="MONTHLY">月度</option>
              <option value="QUARTERLY">季度</option>
              <option value="ANNUAL">年度</option>
              <option value="ADHOC">临时</option>
            </select>
          </Field>
          <Field label="下次截止">
            <input type="date" name="nextDueAt" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="负责人">
            <input name="responsibleName" maxLength={100} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="层级 ⭐">
            <select name="dualLayer" defaultValue="REAL" className="w-full rounded-lg border border-violet-300 bg-violet-50/30 px-3 py-2 text-sm">
              {Object.entries(CASHIER_DUAL_LAYER_META).map(([k, m]) => (
                <option key={k} value={k}>{m.label} — {m.hint}</option>
              ))}
            </select>
          </Field>
          <Field label="状态">
            <select name="status" defaultValue="ACTIVE" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              {Object.entries(CASHIER_COMPLIANCE_STATUS_META).map(([k, m]) => (
                <option key={k} value={k}>{m.label}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="备注">
          <textarea name="notes" rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </Field>
        <div className="flex items-center justify-between gap-2 pt-2">
          <Link href="/dept/cashier?tab=compliance" className="text-xs text-slate-500 hover:underline">取消</Link>
          <button type="submit" className="inline-flex items-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-700">
            新增
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </span>
      {children}
    </label>
  );
}
