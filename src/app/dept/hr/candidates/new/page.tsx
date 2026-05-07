import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireDeptEdit } from '@/lib/dept-access';
import { createHrCandidate } from '../../_actions';

export const dynamic = 'force-dynamic';

export default async function NewHrCandidatePage() {
  await requireDeptEdit('hr');
  const positions = await prisma.hrPosition.findMany({
    where: { status: 'RECRUITING' },
    select: { id: true, title: true },
    orderBy: { createdAt: 'desc' },
  });
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <Link href="/dept/hr/candidates" className="text-sm text-slate-500 hover:text-slate-800">
          ← 返回候选人库
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">添加候选人</h1>
      </div>
      <form action={createHrCandidate} className="space-y-4">
        <Field label="姓名" required>
          <input
            name="name"
            required
            maxLength={100}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="电话">
            <input
              name="phone"
              maxLength={50}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
          </Field>
          <Field label="邮箱">
            <input
              name="email"
              type="email"
              maxLength={200}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
          </Field>
          <Field label="应聘岗位">
            <select
              name="positionId"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
            >
              <option value="">— 未指定 —</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </Field>
          <Field label="阶段">
            <select
              name="stage"
              defaultValue="APPLIED"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
            >
              <option value="APPLIED">投递</option>
              <option value="SCREENING">初筛</option>
              <option value="INTERVIEWING">面试中</option>
              <option value="OFFER">Offer</option>
              <option value="HIRED">已到岗</option>
              <option value="REJECTED">已拒绝</option>
            </select>
          </Field>
        </div>
        <Field label="简历链接（vault 路径或 URL）">
          <input
            name="resumeUrl"
            type="text"
            maxLength={500}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
          />
        </Field>
        <Field label="备注">
          <textarea
            name="notes"
            rows={3}
            maxLength={2000}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700">
            添加候选人
          </button>
          <Link href="/dept/hr/candidates" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
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
