'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * "立即同步 Vault 花名册" 按钮
 *
 * 调 POST /api/finance/vault-ingest 触发 sync。
 * 完成后 router.refresh() 让 server component 重新拉数据。
 */
export function SyncVaultRosterButton({ canSync }: { canSync: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!canSync) {
    return null;
  }

  const handleClick = async () => {
    setResult(null);
    setError(null);
    try {
      const resp = await fetch('/api/finance/vault-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        setError(`HTTP ${resp.status}: ${txt.slice(0, 120)}`);
        return;
      }
      const data = await resp.json();
      const counts = data?.imported?.counts;
      if (counts) {
        setResult(
          `钱包 ${counts.wallets} · 银行 ${counts.banks} · 员工 ${counts.employees ?? 0}`,
        );
      } else {
        setResult('已同步');
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
      >
        {isPending ? '同步中…' : '🔄 同步 vault 花名册'}
      </button>
      {result && <span className="text-xs text-emerald-700">✅ {result}</span>}
      {error && <span className="text-xs text-rose-700">❌ {error}</span>}
    </div>
  );
}
