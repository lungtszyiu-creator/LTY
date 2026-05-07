'use client';

/**
 * 解锁单条暂停员工的按钮（仅 SUPER_ADMIN 才看得到本组件 — 父组件已 gate）
 *
 * 点击 → confirm 二次确认 → POST /api/employees/{id}/unpause
 *      → success: router.refresh() 让 server component 重新拉数据
 *      → fail: 弹 alert
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function UnpauseButton({
  employeeId,
  name,
  reason,
}: {
  employeeId: string;
  name: string;
  reason: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function unlock() {
    const ok = confirm(
      `解锁 "${name}"？\n` +
        `${reason ? `原因：${reason}\n` : ''}` +
        `解锁后 AI 立刻能继续调用。如果是因为日额度太低撞顶，建议先去 /employees 上调额度再解锁。`,
    );
    if (!ok) return;
    startTransition(async () => {
      const r = await fetch(`/api/employees/${employeeId}/unpause`, { method: 'POST' });
      if (r.ok) {
        setDone(true);
        router.refresh();
      } else {
        const j = await r.json().catch(() => ({}));
        alert(`解锁失败：${j.hint ?? j.error ?? r.statusText}`);
      }
    });
  }

  if (done) {
    return (
      <span className="text-[11px] text-emerald-700">✓ 已解锁</span>
    );
  }
  return (
    <button
      type="button"
      onClick={unlock}
      disabled={pending}
      className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
    >
      {pending ? '解锁中…' : '✅ 解锁'}
    </button>
  );
}
