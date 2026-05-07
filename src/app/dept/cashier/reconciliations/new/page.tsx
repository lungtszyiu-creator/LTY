import Link from 'next/link';
import { requireDeptEdit } from '@/lib/dept-access';
import { createReconTask } from '../../_actions';
import { CASHIER_RECON_TYPE_LABEL, CASHIER_CYCLE_LABEL } from '@/lib/cashier-shared';

export const dynamic = 'force-dynamic';

export default async function NewReconTaskPage() {
  await requireDeptEdit('cashier');
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">新增对账任务</h1>
        <Link href="/dept/cashier?tab=reconciliation" className="text-xs text-slate-500 hover:underline">← 返回</Link>
      </header>
      <form action={createReconTask} className="space-y-4">
        <Field label="任务标题" required>
          <input name="title" required maxLength={200} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                 placeholder="如：投放渠道对账（Google/Meta/抖音）" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="对账类型">
            <select name="reconType" defaultValue="OTHER" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              {Object.entries(CASHIER_RECON_TYPE_LABEL).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="周期">
            <select name="cycle" defaultValue="MONTHLY" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              {(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'] as const).map((k) => (
                <option key={k} value={k}>{CASHIER_CYCLE_LABEL[k]}</option>
              ))}
            </select>
          </Field>
          <Field label="负责角色">
            <input name="ownerRole" maxLength={100} placeholder="如：财务专员 / CFO" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="截止日期" required>
            <input type="date" name="dueAt" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </Field>
        </div>
        <Field label="任务描述">
          <textarea name="description" rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </Field>
        <Field label="备注">
          <textarea name="notes" rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </Field>
        <div className="flex items-center justify-between gap-2 pt-2">
          <Link href="/dept/cashier?tab=reconciliation" className="text-xs text-slate-500 hover:underline">取消</Link>
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
