'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ReleaseButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function release(e: React.MouseEvent) {
    // Card wraps in a <Link>; stop propagation so clicking release doesn't also
    // navigate to the detail page.
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('确认释放这条任务？')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/claim`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error ?? '释放失败');
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={release}
      disabled={busy}
      className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-medium text-rose-600 shadow ring-1 ring-rose-200 backdrop-blur transition hover:bg-rose-50 disabled:opacity-50"
    >
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      {busy ? '…' : '释放'}
    </button>
  );
}
