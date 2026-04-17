const MAP: Record<string, { label: string; cls: string; dot: string }> = {
  OPEN:      { label: '待领取', cls: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500' },
  CLAIMED:   { label: '进行中', cls: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500' },
  SUBMITTED: { label: '待审核', cls: 'bg-violet-50 text-violet-700 ring-violet-200', dot: 'bg-violet-500' },
  APPROVED:  { label: '已通过', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  REJECTED:  { label: '已驳回', cls: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500' },
  ARCHIVED:  { label: '已归档', cls: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400' },
  PENDING:   { label: '待审核', cls: 'bg-violet-50 text-violet-700 ring-violet-200', dot: 'bg-violet-500' },
};

export default function StatusBadge({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const m = MAP[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400' };
  const sizeCls = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2.5 py-0.5';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ring-1 ${m.cls} ${sizeCls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}
