// Concurrent tasks a member may hold in CLAIMED status at once.
// Munger-style anti-gaming: stop claim-hoarders.
export const MAX_CONCURRENT_CLAIMS = 3;

export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export const PRIORITY_META: Record<Priority, { label: string; dot: string; ring: string; text: string; bg: string; pointsHint: string }> = {
  LOW:     { label: '低',    dot: 'bg-slate-400',  ring: 'ring-slate-200',   text: 'text-slate-600',  bg: 'bg-slate-50',  pointsHint: '5' },
  NORMAL:  { label: '普通',  dot: 'bg-sky-500',    ring: 'ring-sky-200',     text: 'text-sky-700',    bg: 'bg-sky-50',    pointsHint: '10' },
  HIGH:    { label: '重要',  dot: 'bg-amber-500',  ring: 'ring-amber-200',   text: 'text-amber-800',  bg: 'bg-amber-50',  pointsHint: '20' },
  URGENT:  { label: '紧急',  dot: 'bg-rose-500',   ring: 'ring-rose-300',    text: 'text-rose-700',   bg: 'bg-rose-50',   pointsHint: '35' },
};
