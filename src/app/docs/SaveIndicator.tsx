'use client';

import { useEffect, useState } from 'react';

// Persistent "last saved" chip so users never wonder whether their edits
// made it to the server. Updates its relative-time text every 30s.
export default function SaveIndicator({
  status,
  lastSavedAt,
  canEdit,
}: {
  status: 'idle' | 'saving' | 'saved' | 'synced' | 'error';
  lastSavedAt: Date | null;
  canEdit: boolean;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!lastSavedAt) return;
    const id = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [lastSavedAt]);

  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 ring-1 ring-slate-200">
        <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
          <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
        正在保存…
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-800 ring-1 ring-rose-300">
        ⚠️ 保存失败，稍后重试
      </span>
    );
  }

  if (!canEdit) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2 py-0.5 text-[11px] text-white">
        🔒 只读
      </span>
    );
  }

  // Idle / saved / synced → show "已保存（X 分钟前）"
  const label = lastSavedAt ? `✓ 已保存 · ${relTime(lastSavedAt)}` : '✓ 自动保存已开启';
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800 ring-1 ring-emerald-200">
      {label}
    </span>
  );
}

function relTime(d: Date): string {
  const now = Date.now();
  const diffMs = now - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 10) return '刚刚';
  if (sec < 60) return `${sec} 秒前`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  return d.toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
}
