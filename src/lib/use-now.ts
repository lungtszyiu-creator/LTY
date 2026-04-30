'use client';

/**
 * 全局共享时钟 hook —— 所有 Countdown / 时间显示组件订阅同一个 tick，
 * 而不是各自 setInterval。
 *
 * Why：dashboard 上每张任务卡都挂一个 <Countdown/>。如果每个组件都
 * setInterval(setState, 1000) → N 张卡 = N 个独立 timer × N 次 React
 * re-render/秒 → 主线程被 React reconciliation 占满 → iOS Safari 滚动
 * 时合成线程仍跑（scrollbar 顺滑），但内容 paint 排不上 → 用户看到
 * "滚动条动了内容没动，要刷几下才滑"。
 *
 * 解法：单一 timer，所有订阅者共享。同时按 granularity 选频率：
 *   - second：刚到期 / <1 小时倒计时才需要秒级
 *   - minute：>1 小时的远期 deadline，一分钟刷新一次足够
 *
 * 使用：
 *   const now = useNow('minute'); // 远期，省电
 *   const now = useNow('second'); // 紧急，秒级
 */
import { useEffect, useState } from 'react';

type Granularity = 'second' | 'minute';

const subscribers: Record<Granularity, Set<(t: number) => void>> = {
  second: new Set(),
  minute: new Set(),
};
const intervals: Record<Granularity, ReturnType<typeof setInterval> | null> = {
  second: null,
  minute: null,
};

function ensureTick(g: Granularity) {
  if (intervals[g]) return;
  const ms = g === 'second' ? 1000 : 60_000;
  intervals[g] = setInterval(() => {
    const t = Date.now();
    subscribers[g].forEach((cb) => cb(t));
  }, ms);
}

function maybeStop(g: Granularity) {
  if (subscribers[g].size === 0 && intervals[g]) {
    clearInterval(intervals[g]!);
    intervals[g] = null;
  }
}

export function useNow(granularity: Granularity = 'minute'): number | null {
  // 初值返 null，避免 SSR / hydration mismatch（服务端没 Date.now 概念）
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    subscribers[granularity].add(setNow);
    ensureTick(granularity);
    return () => {
      subscribers[granularity].delete(setNow);
      maybeStop(granularity);
    };
  }, [granularity]);

  return now;
}
