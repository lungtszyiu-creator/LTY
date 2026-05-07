import Link from 'next/link';
import { requireDeptEdit } from '@/lib/dept-access';
import { LegalRequestForm } from '@/components/legal/LegalRequestForm';
import { createLtyLegalRequest } from '../../_actions';

export const dynamic = 'force-dynamic';

export default async function NewLtyLegalRequestPage() {
  await requireDeptEdit('lty-legal');
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <Link href="/dept/lty-legal" className="text-sm text-slate-500 hover:text-slate-800">
          ← 返回 LTY 法务
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">发起法务需求</h1>
      </div>
      <LegalRequestForm
        mode="create"
        action={createLtyLegalRequest}
        cancelHref="/dept/lty-legal"
      />
    </div>
  );
}
