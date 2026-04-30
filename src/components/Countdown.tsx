'use client';

import { useNow } from '@/lib/use-now';

type Props = {
  /** If provided, shows a live countdown TO this date. */
  deadline?: Date | string | null;
  /** If provided and no deadline, shows elapsed time SINCE this date (counting up). */
  since?: Date | string | null;
  size?: 'sm' | 'md' | 'lg';
  compact?: boolean;
};

function toMs(d: Date | string | null | undefined) {
  if (!d) return null;
  return new Date(d).getTime();
}

function split(ms: number) {
  const abs = Math.abs(ms);
  const d = Math.floor(abs / 86_400_000);
  const h = Math.floor((abs % 86_400_000) / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const s = Math.floor((abs % 60_000) / 1000);
  return { d, h, m, s };
}

export default function Countdown({ deadline, since, size = 'md', compact = false }: Props) {
  // 智能频率：远期 deadline 一分钟刷新一次（数字差别看不出来），
  // 进入最后 1 小时才秒级刷新。配合 useNow 的全局共享 timer，
  // dashboard N 张卡只会有 1 个 setInterval 而不是 N 个。
  const dl = toMs(deadline);
  const sc = toMs(since);
  const target = dl ?? sc ?? null;
  const distance = target !== null ? Math.abs(target - Date.now()) : Infinity;
  const granularity: 'second' | 'minute' = distance <= 3600_000 ? 'second' : 'minute';
  const now = useNow(granularity);

  if (now === null) {
    return <span className="inline-flex items-center gap-1 text-slate-400">…</span>;
  }

  const padSize = size === 'lg' ? 'text-lg' : size === 'sm' ? 'text-xs' : 'text-sm';
  const numCls = `tabular-nums font-semibold ${padSize}`;

  if (deadline) {
    const dl = toMs(deadline)!;
    const diff = dl - now;
    const past = diff <= 0;
    const { d, h, m, s } = split(diff);

    if (past) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          已过期 {d > 0 ? `${d}天` : h > 0 ? `${h}时` : `${m}分`}
        </span>
      );
    }

    const totalH = d * 24 + h;
    const tone =
      totalH <= 6 ? 'rose'
      : totalH <= 24 ? 'amber'
      : totalH <= 72 ? 'gold'
      : 'neutral';

    const toneCls = {
      rose:    'bg-rose-50 text-rose-700 ring-rose-200',
      amber:   'bg-amber-50 text-amber-800 ring-amber-200',
      gold:    'bg-[#faf3e4] text-[#8a5a1c] ring-[#e8c98f]',
      neutral: 'bg-slate-50 text-slate-700 ring-slate-200',
    }[tone];

    const dotCls = {
      rose: 'bg-rose-500', amber: 'bg-amber-500', gold: 'bg-[#d4a574]', neutral: 'bg-slate-400',
    }[tone];

    const urgent = tone === 'rose';

    if (compact) {
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 ${padSize} ring-1 ${toneCls}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${dotCls} ${urgent ? 'urgent-pulse' : ''}`} />
          {d > 0 && <span className={numCls}>{d}<span className="ml-0.5 text-[0.7em] font-normal opacity-70">d</span></span>}
          <span className={numCls}>{String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</span>
        </span>
      );
    }

    return (
      <div className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 ring-1 ${toneCls}`}>
        <span className={`h-2 w-2 rounded-full ${dotCls} ${urgent ? 'urgent-pulse' : ''}`} />
        <div className="flex items-baseline gap-1">
          {d > 0 && (
            <>
              <span className={numCls}>{d}</span>
              <span className="text-[10px] opacity-70">天</span>
            </>
          )}
          <span className={`${numCls} ml-1`}>{String(h).padStart(2, '0')}</span>
          <span className="text-[10px] opacity-70">时</span>
          <span className={numCls}>{String(m).padStart(2, '0')}</span>
          <span className="text-[10px] opacity-70">分</span>
          <span className={`${numCls} opacity-70`}>{String(s).padStart(2, '0')}</span>
          <span className="text-[10px] opacity-70">秒</span>
        </div>
      </div>
    );
  }

  if (since) {
    const sc = toMs(since)!;
    const diff = now - sc;
    if (diff < 0) return null;
    const { d, h, m } = split(diff);
    const parts = [];
    if (d > 0) parts.push(`${d}天`);
    if (h > 0 || d > 0) parts.push(`${h}小时`);
    parts.push(`${m}分钟`);
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        已进行 {parts.join(' ')}
      </span>
    );
  }

  return null;
}
