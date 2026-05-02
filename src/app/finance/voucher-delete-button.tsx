'use client';

/**
 * 单条凭证 quick delete 按钮（/finance 主页待审凭证 list 用）
 *
 * 仅总管理者（SUPER_ADMIN）可见。点击后 confirm → DELETE → router.refresh()。
 * 不进详情页直接清掉，方便老板批量手动清理早期/无标记的测试残留。
 *
 * 注意 stopPropagation：每行外层是 <Link href="/finance/vouchers/[id]">，
 * 不阻止冒泡的话点删除会同时触发跳转。
 */
import { useRouter } from 'next/navigation';
import { useTransition, useState } from 'react';

export function VoucherDeleteButton({
  voucherId,
  summary,
  size = 'md',
}: {
  voucherId: string;
  summary: string;
  size?: 'sm' | 'md';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`永久删除凭证「${summary}」？\n该操作不可恢复，仅用于清理测试残留。`)) return;
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/finance/vouchers/${voucherId}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg = j.hint ?? j.error ?? `HTTP ${res.status}`;
        setError(msg);
        // toast 风格的错误显示太重，这里直接 alert 让老板看清楚
        alert(`删除失败：${msg}`);
        return;
      }
      router.refresh();
    });
  }

  const cls =
    size === 'sm'
      ? 'rounded-md border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50'
      : 'rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={cls}
      title={error ?? '永久删除（仅总管理者）'}
    >
      {pending ? '删除中…' : '🗑️ 删除'}
    </button>
  );
}
