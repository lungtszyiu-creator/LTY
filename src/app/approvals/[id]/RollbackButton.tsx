'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Shows for SUPER_ADMIN / HR lead on APPROVED or REJECTED instances.
// Confirms, collects an optional reason, calls the rollback API, and
// surfaces the compensating ledger count returned by the server.
export default function RollbackButton({ instanceId }: { instanceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    const reason = window.prompt(
      '撤销这条已终结审批，并把相关假期余额回滚？\n\n回滚会写入补偿流水（不会删除原始记录）。请简要写一下原因：',
      ''
    );
    if (reason === null) return; // user cancelled the prompt
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/approvals/${instanceId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(body.message ?? body.error ?? '回滚失败');
        return;
      }
      alert(`已撤销并回滚 ${body.rolledBack ?? 0} 条余额流水`);
      router.refresh();
    } catch (e: any) {
      alert(e?.message ?? '网络错误');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="btn btn-ghost text-xs text-amber-700 ring-1 ring-amber-300 hover:bg-amber-50"
    >
      {busy ? '回滚中…' : '↩ 撤销并回滚余额'}
    </button>
  );
}
