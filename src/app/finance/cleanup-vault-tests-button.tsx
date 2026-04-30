'use client';

/**
 * Vault TEST 文件一键清理按钮（仅老板可见）
 *
 * 用 GitHub API 删除 lty-vault `raw/ai_reports/<role>/` 下文件名含
 * `-test-...connectivity` 的归档文件。dryRun → confirm 两步保护。
 */
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type WouldDeleteItem = { role: string; name: string; path: string };
type DeletedItem = { role: string; path: string; commitSha?: string };

export function CleanupVaultTestsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stage, setStage] = useState<'idle' | 'preview' | 'done'>('idle');
  const [preview, setPreview] = useState<{ items: WouldDeleteItem[]; count: number } | null>(null);
  const [result, setResult] = useState<{ deleted: number; failed: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(body: { confirm?: boolean; dryRun?: boolean }) {
    setError(null);
    const res = await fetch('/api/admin/finance/cleanup-vault-tests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(j.error ?? `HTTP ${res.status}`);
      return null;
    }
    return j;
  }

  function onPreview() {
    startTransition(async () => {
      const j = await call({ dryRun: true });
      if (j) {
        setPreview({ items: j.wouldDelete, count: j.count });
        setStage('preview');
      }
    });
  }

  function onConfirm() {
    startTransition(async () => {
      const j = await call({ confirm: true });
      if (j) {
        setResult(j.counts);
        setStage('done');
        router.refresh();
      }
    });
  }

  function reset() {
    setStage('idle');
    setPreview(null);
    setResult(null);
    setError(null);
  }

  return (
    <div className="space-y-2">
      {stage === 'idle' && (
        <button
          type="button"
          onClick={onPreview}
          disabled={pending}
          className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-200 disabled:opacity-50"
        >
          {pending ? '扫描 vault 中...' : '🧹 清理 Vault TEST 归档（预览）'}
        </button>
      )}

      {stage === 'preview' && preview && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="text-sm font-medium text-amber-900">
            将从 lty-vault repo 删除 <strong>{preview.count}</strong> 个 TEST 归档：
          </div>
          {preview.count > 0 ? (
            <ul className="space-y-0.5 max-h-40 overflow-y-auto text-[11px] font-mono text-amber-900">
              {preview.items.map((it, i) => (
                <li key={i}>· {it.path}</li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-amber-700">vault 干净，没有 TEST 文件。</div>
          )}
          <div className="text-[11px] text-amber-700">
            匹配规则：文件名含 `test-` 和 `connectivity` 双关键词（避免误伤正常归档）。每个删除会在 lty-vault repo 留 commit。
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending || preview.count === 0}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-700 disabled:opacity-50"
            >
              {pending ? '删除中...' : `✅ 确认删除 ${preview.count} 个`}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={pending}
              className="rounded-lg px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {stage === 'done' && result && (
        <div className="space-y-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3">
          <div className="text-sm font-medium text-emerald-900">
            ✅ 已删除 {result.deleted}/{result.total} 个 TEST 文件{result.failed > 0 && `（失败 ${result.failed} 个）`}
          </div>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100"
          >
            关闭
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
          {error}
        </div>
      )}
    </div>
  );
}
