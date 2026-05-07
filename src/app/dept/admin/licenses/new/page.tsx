/**
 * 新建证照页 (/dept/admin/licenses/new)
 *
 * server action 经 _actions.ts 的 createLicense。
 */
import Link from 'next/link';
import { requireDeptEdit } from '@/lib/dept-access';
import { LicenseForm } from '../../_components/LicenseForm';
import { createLicense } from '../../_actions';

export const dynamic = 'force-dynamic';

export default async function NewLicensePage() {
  await requireDeptEdit('admin');
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <Link href="/dept/admin?tab=licenses" className="text-sm text-slate-500 hover:text-slate-800">
          ← 返回行政部 · 证照
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">新增证照 / 合同</h1>
      </div>
      <LicenseForm
        mode="create"
        action={createLicense}
        cancelHref="/dept/admin?tab=licenses"
      />
    </div>
  );
}
