const MAP: Record<string, { label: string; cls: string }> = {
  OPEN:      { label: '待领取', cls: 'bg-blue-100 text-blue-700' },
  CLAIMED:   { label: '进行中', cls: 'bg-amber-100 text-amber-700' },
  SUBMITTED: { label: '待审核', cls: 'bg-purple-100 text-purple-700' },
  APPROVED:  { label: '已通过', cls: 'bg-emerald-100 text-emerald-700' },
  REJECTED:  { label: '已驳回', cls: 'bg-rose-100 text-rose-700' },
  ARCHIVED:  { label: '已归档', cls: 'bg-slate-200 text-slate-600' },
  PENDING:   { label: '待审核', cls: 'bg-purple-100 text-purple-700' },
};

export default function StatusBadge({ status }: { status: string }) {
  const m = MAP[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600' };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs ${m.cls}`}>
      {m.label}
    </span>
  );
}
