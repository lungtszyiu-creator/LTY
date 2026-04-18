import { PRIORITY_META, type Priority } from '@/lib/constants';

export default function PriorityBadge({ priority }: { priority: string }) {
  const key = (['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priority) ? priority : 'NORMAL') as Priority;
  if (key === 'NORMAL') return null; // avoid noise on default tasks
  const m = PRIORITY_META[key];
  const urgent = key === 'URGENT';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs ring-1 ${m.bg} ${m.text} ${m.ring}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot} ${urgent ? 'urgent-pulse' : ''}`} />
      {m.label}
    </span>
  );
}
