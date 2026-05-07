/**
 * 员工档案表单 —— 新建 + 编辑共用
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';

const EMPLOYMENT_TYPES = [
  { value: 'FULL_TIME', label: '全职' },
  { value: 'PART_TIME', label: '兼职' },
  { value: 'INTERN', label: '实习' },
  { value: 'CONTRACTOR', label: '外包' },
];
const WORK_LOCATIONS = [
  { value: 'ONSITE', label: '坐班' },
  { value: 'REMOTE', label: '远程' },
];
const STATUSES = [
  { value: 'ACTIVE', label: '在职' },
  { value: 'PROBATION', label: '试用期' },
  { value: 'RESIGNED', label: '离职' },
];
const ID_TYPES = [
  { value: '', label: '— 未指定 —' },
  { value: 'ID_CARD', label: '身份证' },
  { value: 'PASSPORT', label: '护照' },
  { value: 'WORK_PERMIT', label: '工作许可证' },
];

type Initial = {
  id?: string;
  userId: string;
  department: string | null;
  positionTitle: string | null;
  employmentType: string;
  workLocation: string;
  hireDate: Date | null;
  probationEnd: Date | null;
  contractEnd: Date | null;
  idType: string | null;
  idNumber: string | null;
  idExpireAt: Date | null;
  status: string;
  notes: string | null;
};

function dateValue(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : '';
}

export async function EmployeeForm({
  mode,
  initial,
  action,
  cancelHref,
}: {
  mode: 'create' | 'edit';
  initial?: Initial;
  action: (formData: FormData) => Promise<void>;
  cancelHref: string;
}) {
  // 新建时拉所有未建档案的 active 用户；编辑时只显示当前 user
  const allUsers = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });
  const existingProfiles = mode === 'create'
    ? await prisma.hrEmployeeProfile.findMany({ select: { userId: true } })
    : [];
  const usedIds = new Set(existingProfiles.map((p) => p.userId));
  const availableUsers = mode === 'create'
    ? allUsers.filter((u) => !usedIds.has(u.id))
    : allUsers;

  return (
    <form action={action} className="space-y-4">
      <Field label="员工" required>
        {mode === 'create' ? (
          <select
            name="userId"
            required
            defaultValue={initial?.userId ?? ''}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
          >
            <option value="">— 选择员工 —</option>
            {availableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.email}
              </option>
            ))}
          </select>
        ) : (
          <input type="hidden" name="userId" value={initial!.userId} />
        )}
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="部门">
          <input
            name="department"
            type="text"
            defaultValue={initial?.department ?? ''}
            placeholder="如：财务部 / 行政部"
            maxLength={100}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
          />
        </Field>
        <Field label="职位">
          <input
            name="positionTitle"
            type="text"
            defaultValue={initial?.positionTitle ?? ''}
            placeholder="如：高级前端工程师"
            maxLength={100}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
          />
        </Field>
        <Field label="用工类型" required>
          <select
            name="employmentType"
            defaultValue={initial?.employmentType ?? 'FULL_TIME'}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
          >
            {EMPLOYMENT_TYPES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="办公地点" required>
          <select
            name="workLocation"
            defaultValue={initial?.workLocation ?? 'ONSITE'}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
          >
            {WORK_LOCATIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="入职日期">
          <input
            name="hireDate"
            type="date"
            defaultValue={dateValue(initial?.hireDate)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
          />
        </Field>
        <Field label="试用期到期" hint="30 天内进 banner 提醒">
          <input
            name="probationEnd"
            type="date"
            defaultValue={dateValue(initial?.probationEnd)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
          />
        </Field>
        <Field label="合同到期">
          <input
            name="contractEnd"
            type="date"
            defaultValue={dateValue(initial?.contractEnd)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
          />
        </Field>
        <Field label="状态" required>
          <select
            name="status"
            defaultValue={initial?.status ?? 'ACTIVE'}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
          >
            {STATUSES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="证件类型">
          <select
            name="idType"
            defaultValue={initial?.idType ?? ''}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
          >
            {ID_TYPES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="证件号码">
          <input
            name="idNumber"
            type="text"
            defaultValue={initial?.idNumber ?? ''}
            maxLength={64}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
          />
        </Field>
        <Field label="证件到期" hint="60 天内进 banner 提醒">
          <input
            name="idExpireAt"
            type="date"
            defaultValue={dateValue(initial?.idExpireAt)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
          />
        </Field>
      </div>
      <Field label="备注">
        <textarea
          name="notes"
          rows={2}
          defaultValue={initial?.notes ?? ''}
          maxLength={2000}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700"
        >
          {mode === 'create' ? '创建档案' : '保存修改'}
        </button>
        <Link
          href={cancelHref}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          取消
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  required = false,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
        {hint && <span className="ml-2 font-normal text-slate-400">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
