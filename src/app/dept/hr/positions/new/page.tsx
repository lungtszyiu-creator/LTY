import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireDeptEdit } from '@/lib/dept-access';
import { createHrPosition } from '../../_actions';

export const dynamic = 'force-dynamic';

export default async function NewHrPositionPage() {
  await requireDeptEdit('hr');
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <Link href="/dept/hr/positions" className="text-sm text-slate-500 hover:text-slate-800">
          ← 返回岗位列表
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">新建岗位</h1>
      </div>
      <form action={createHrPosition} className="space-y-4">
        <Field label="岗位名称" required>
          <input
            name="title"
            required
            maxLength={200}
            placeholder="如：高级前端工程师"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="部门">
            <input
              name="department"
              maxLength={100}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
          </Field>
          <Field label="状态" required>
            <select
              name="status"
              defaultValue="RECRUITING"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
            >
              <option value="RECRUITING">招聘中</option>
              <option value="PAUSED">暂停</option>
              <option value="CLOSED">关闭</option>
            </select>
          </Field>
          <Field label="招聘人数">
            <input
              name="headcount"
              type="number"
              min="1"
              defaultValue="1"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
          </Field>
          <Field label="截止日期">
            <input
              name="deadline"
              type="date"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
          </Field>
          <Field label="负责人（HR）">
            <select
              name="leadId"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
            >
              <option value="">— 未指定 —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="岗位描述">
          <textarea
            name="description"
            rows={4}
            maxLength={2000}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
          >
            创建岗位
          </button>
          <Link
            href="/dept/hr/positions"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            取消
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) {
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
