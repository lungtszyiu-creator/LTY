/**
 * HR · 员工档案详情 + 编辑 (/dept/hr/employees/[id])
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireDeptView } from '@/lib/dept-access';
import { EmployeeForm } from '../_components/EmployeeForm';
import { ConfirmDeleteForm } from '@/app/dept/admin/_components/ConfirmDeleteForm';
import { updateHrEmployeeProfile, deleteHrEmployeeProfile } from '../../_actions';

export const dynamic = 'force-dynamic';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: '在职', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  PROBATION: { label: '试用期', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  RESIGNED: { label: '已离职', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

export default async function HrEmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireDeptView('hr');
  const { id } = await params;
  const e = await prisma.hrEmployeeProfile.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!e) notFound();

  const sm = STATUS_META[e.status] ?? STATUS_META.ACTIVE;
  const canEdit = ctx.level === 'LEAD' || ctx.isSuperAdmin;
  const updateAction = updateHrEmployeeProfile.bind(null, e.id);
  const deleteAction = deleteHrEmployeeProfile.bind(null, e.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-baseline justify-between">
        <Link href="/dept/hr/employees" className="text-sm text-slate-500 hover:text-slate-800">
          ← 返回员工档案
        </Link>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${sm.cls}`}>{sm.label}</span>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{e.user.name ?? e.user.email}</h1>
        <div className="mt-1 text-sm text-slate-500">
          {e.department ?? '—'}{e.positionTitle && ` · ${e.positionTitle}`}
        </div>
      </header>

      {canEdit ? (
        <section className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-600">编辑档案</h2>
          <EmployeeForm
            mode="edit"
            initial={{
              id: e.id,
              userId: e.userId,
              department: e.department,
              positionTitle: e.positionTitle,
              employmentType: e.employmentType,
              workLocation: e.workLocation,
              hireDate: e.hireDate,
              probationEnd: e.probationEnd,
              contractEnd: e.contractEnd,
              idType: e.idType,
              idNumber: e.idNumber,
              idExpireAt: e.idExpireAt,
              status: e.status,
              notes: e.notes,
            }}
            action={updateAction}
            cancelHref={`/dept/hr/employees/${e.id}`}
          />
          {ctx.isSuperAdmin && (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <ConfirmDeleteForm
                action={deleteAction}
                message={`永久删除「${e.user.name ?? e.user.email}」的员工档案？\n该操作不可恢复。User 账号本身不会删。`}
              >
                <button
                  type="submit"
                  className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                >
                  🗑️ 永久删除档案（仅总管）
                </button>
              </ConfirmDeleteForm>
            </div>
          )}
        </section>
      ) : (
        <div className="rounded-xl border border-sky-200/60 bg-sky-50/40 p-4 text-xs text-sky-900">
          👁 你是部门成员，只能查看，无法编辑档案。
        </div>
      )}
    </div>
  );
}
