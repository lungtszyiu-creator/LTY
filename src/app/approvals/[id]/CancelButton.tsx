'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function CancelButton({
  instanceId,
  kind = 'cancel',
}: {
  instanceId: string;
  kind?: 'cancel' | 'hardDelete';
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    const msg = kind === 'hardDelete'
      ? '⚠️ 永久删除这条审批？所有步骤、附件、历史都会消失且不可恢复。'
      : '撤销这条审批？';
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      const url = kind === 'hardDelete'
        ? `/api/approvals/${instanceId}?hard=1`
        : `/api/approvals/${instanceId}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error ?? '操作失败');
        setBusy(false);
        return;
      }
      router.push('/approvals');
      router.refresh();
    } catch (e: any) {
      alert(e.message ?? '网络错误');
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className={`btn btn-ghost text-xs ${kind === 'hardDelete' ? 'text-rose-600 ring-1 ring-rose-200' : 'text-rose-600'}`}
    >
      {busy ? '处理中…' : (kind === 'hardDelete' ? '永久删除' : '撤销')}
    </button>
  );
}
