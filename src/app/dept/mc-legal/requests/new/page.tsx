import Link from 'next/link';
import { requireDeptEdit } from '@/lib/dept-access';
import { LegalRequestForm } from '@/components/legal/LegalRequestForm';
import { createMcLegalRequest } from '../../_actions';

export const dynamic = 'force-dynamic';

export default async function NewMcLegalRequestPage() {
  await requireDeptEdit('mc-legal');
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <Link href="/dept/mc-legal" className="text-sm text-slate-500 hover:text-slate-800">
          ← 返回 MC 法务
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">发起法务需求</h1>
        <p className="mt-1 text-xs text-purple-700">🔒 此需求落 McLegalRequest 表（与 LTY 物理隔离）</p>
      </div>
      <LegalRequestForm
        mode="create"
        action={createMcLegalRequest}
        cancelHref="/dept/mc-legal"
      />
    </div>
  );
}
