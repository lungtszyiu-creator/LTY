'use client';

/**
 * 自动监控 toggle —— 控制 cron 是否每天拉这个钱包的余额快照
 *
 * 关键场景：老板个人钱包混着私人和公司流水，必须 autoMonitor=false
 * 避免 cron 把私人交易拉进公司账面。
 */
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export function AutoMonitorToggle({
  walletId,
  initial,
}: {
  walletId: string;
  initial: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onToggle() {
    const next = !enabled;
    const confirmed =
      next === false
        ? confirm(
            '关闭自动监控？\n\n钱包余额 cron 每天 UTC 00:00 不再拉这条钱包的余额。' +
              '\n适合老板个人钱包（混着私人/公司流水）。',
          )
        : confirm('开启自动监控？\n\nCron 每天会拉这条钱包的 ETH/USDT/USDC 余额存入历史。');
    if (!confirmed) return;

    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/finance/wallets/${walletId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoMonitor: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      setEnabled(next);
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
          enabled
            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100'
            : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200'
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
        自动监控：{enabled ? '已开启' : '已关闭'}
        <span className="text-slate-400">（点击切换）</span>
      </button>
      {!enabled && (
        <div className="text-[11px] text-slate-500">
          关闭后 cron 不再拉这条钱包余额。适合老板个人钱包（混着私人/公司流水）。
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-rose-50 px-3 py-1.5 text-[11px] text-rose-700 ring-1 ring-rose-200">
          {error}
        </div>
      )}
    </div>
  );
}
