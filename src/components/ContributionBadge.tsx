import { CONTRIBUTION_META, type Contribution } from '@/lib/constants';

export default function ContributionBadge({ contribution, size = 'md' }: { contribution: string; size?: 'sm' | 'md' }) {
  const key = (Object.keys(CONTRIBUTION_META).includes(contribution) ? contribution : 'OTHER') as Contribution;
  const m = CONTRIBUTION_META[key];
  const pad = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full ring-1 ${m.bg} ${m.text} ${m.ring} ${pad}`}>
      <span className="text-[11px]">{m.icon}</span>
      {m.label}
    </span>
  );
}
