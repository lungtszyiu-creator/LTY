import Link from 'next/link';
import { requireDeptEdit } from '@/lib/dept-access';
import { EmployeeForm } from '../_components/EmployeeForm';
import { createHrEmployeeProfile } from '../../_actions';

export const dynamic = 'force-dynamic';

export default async function NewHrEmployeePage() {
  await requireDeptEdit('hr');
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <Link href="/dept/hr/employees" className="text-sm text-slate-500 hover:text-slate-800">
          ← 返回员工档案
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">新增员工档案</h1>
        <p className="mt-1 text-xs text-slate-500">每个 LTY 用户最多一份档案。绑定后试用期 / 证件到期会自动出现在 HR 主页 banner。</p>
      </div>
      <EmployeeForm mode="create" action={createHrEmployeeProfile} cancelHref="/dept/hr/employees" />
    </div>
  );
}
