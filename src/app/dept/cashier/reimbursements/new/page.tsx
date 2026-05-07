import Link from 'next/link';
import { requireDeptEdit } from '@/lib/dept-access';
import { createReimbursement } from '../../_actions';
import { CASHIER_REIMB_CATEGORY_LABEL } from '@/lib/cashier-shared';

export const dynamic = 'force-dynamic';

export default async function NewReimbursementPage() {
  await requireDeptEdit('cashier');
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">发起报销申请</h1>
        <Link href="/dept/cashier?tab=expense" className="text-xs text-slate-500 hover:underline">← 返回</Link>
      </header>
      <form action={createReimbursement} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="类型" required>
            <select name="category" required defaultValue="TRAVEL" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              {Object.entries(CASHIER_REIMB_CATEGORY_LABEL).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="部门">
            <input name="department" placeholder="财务部 / 行政 ..." className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="标题" required>
            <input name="title" required maxLength={200} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="费用日期">
            <input type="date" name="occurredOn" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="金额" required>
            <input type="number" step="0.01" name="amount" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="币种" required>
            <select name="currency" defaultValue="CNY" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="CNY">CNY (¥)</option>
              <option value="HKD">HKD (HK$)</option>
              <option value="USD">USD ($)</option>
            </select>
          </Field>
          <Field label="状态">
            <select name="status" defaultValue="PENDING" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="PENDING">待审批</option>
              <option value="APPROVED">已批准</option>
              <option value="REJECTED">已拒绝</option>
              <option value="PAID">已付款</option>
            </select>
          </Field>
        </div>
        <Field label="事由">
          <textarea name="reason" rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </Field>
        <Field label="备注">
          <textarea name="notes" rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </Field>
        <div className="flex items-center justify-between gap-2 pt-2">
          <Link href="/dept/cashier?tab=expense" className="text-xs text-slate-500 hover:underline">取消</Link>
          <button type="submit" className="inline-flex items-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-700">
            发起申请
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
