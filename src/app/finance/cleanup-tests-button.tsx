'use client';

/**
 * 测试数据一键清理按钮（仅老板可见）
 *
 * 流程：
 *   1. 第一次点 → 调 dryRun，显示会删多少条
 *   2. 第二次点 → 真删，刷新页面
 *   3. 删完显示删除数量
 */
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type Counts = {
  vouchers: number;
  chainTransactions: number;
  fxRates: number;
  reconciliations: number;
  total: number;
};

export function CleanupTestsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stage, setStage] = useState<'idle' | 'preview' | 'done'>('idle');
  const [preview, setPreview] = useState<Counts | null>(null);
  const [result, setResult] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(body: { confirm?: boolean; dryRun?: boolean }) {
    setError(null);
    const res = await fetch('/api/admin/finance/cleanup-tests', {
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
        setPreview(j.wouldDelete);
        setStage('preview');
      }
    });
  }

  function onConfirm() {
    startTransition(async () => {
      const j = await call({ confirm: true });
      if (j) {
        setResult(j.deleted);
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
          {pending ? '统计中...' : '🧹 清理测试数据（预览）'}
        </button>
      )}

      {stage === 'preview' && preview && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="text-sm font-medium text-amber-900">将要删除：</div>
          <ul className="text-xs text-amber-900 space-y-0.5">
            <li>• 凭证：<strong>{preview.vouchers}</strong> 条</li>
            <li>• 链上交易：<strong>{preview.chainTransactions}</strong> 条</li>
            <li>• 汇率：<strong>{preview.fxRates}</strong> 条</li>
            <li>• 对账：<strong>{preview.reconciliations}</strong> 条</li>
            <li className="pt-1 border-t border-amber-200">合计：<strong>{preview.total}</strong> 条</li>
          </ul>
          <div className="text-[11px] text-amber-700">
            匹配规则：summary 含 "TEST" 或 "connectivity check" / txHash 以 0xTEST_ 开头 / source=TEST / resolutionNote 含 TEST。AiActivityLog 保留（FK 置 null）。
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending || preview.total === 0}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-700 disabled:opacity-50"
            >
              {pending ? '删除中...' : `✅ 确认删除 ${preview.total} 条`}
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
            ✅ 已清理 {result.total} 条测试数据
          </div>
          <ul className="text-xs text-emerald-900 space-y-0.5">
            <li>凭证 {result.vouchers} / 链上交易 {result.chainTransactions} / 汇率 {result.fxRates} / 对账 {result.reconciliations}</li>
          </ul>
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
