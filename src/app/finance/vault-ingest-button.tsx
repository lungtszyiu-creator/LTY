'use client';

/**
 * Vault → Dashboard 主数据一键导入按钮
 *
 * 流程：dryRun 预览 → 确认导入 → 显示结果 → 自动刷新
 */
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type WalletMap = {
  label: string;
  chain: string;
  address: string;
  holderType: string;
  purpose: string | null;
};
type BankMap = {
  label: string;
  bankName: string;
  accountType: string;
  accountNumber: string;
  currency: string;
};

type EmployeeMap = {
  title: string;
  chineseName?: string | null;
  englishName?: string | null;
  employmentType?: string | null;
  status?: string | null;
  monthlySalary?: string | number | null;
  currency?: string | null;
};
type CompanyMap = {
  title: string;
  jurisdiction?: string | null;
  status?: string | null;
  relationToLty?: string | null;
};
type Preview = {
  wallets: WalletMap[];
  banks: BankMap[];
  employees?: EmployeeMap[];
  companies?: CompanyMap[];
  counts: {
    wallets: number;
    banks: number;
    employees?: number;
    companies?: number;
    salaryRowsParsed?: number;
  };
};

export function VaultIngestButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stage, setStage] = useState<'idle' | 'preview' | 'done'>('idle');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<{
    wallets: number;
    banks: number;
    employees?: number;
    companies?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(body: { dryRun?: boolean }) {
    setError(null);
    const res = await fetch('/api/finance/vault-ingest', {
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
        setPreview({
          wallets: j.wallets,
          banks: j.banks,
          employees: j.employees,
          companies: j.companies,
          counts: j.counts,
        });
        setStage('preview');
      }
    });
  }

  function onConfirm() {
    startTransition(async () => {
      const j = await call({});
      if (j) {
        setResult(j.imported.counts);
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
          className="rounded-lg bg-indigo-100 px-3 py-1.5 text-xs font-medium text-indigo-800 ring-1 ring-indigo-200 transition hover:bg-indigo-200 disabled:opacity-50"
        >
          {pending ? '读取 vault 中...' : '📥 从 Vault 导入主数据（钱包 / 银行 / 员工 / 公司）'}
        </button>
      )}

      {stage === 'preview' && preview && (
        <div className="space-y-3 rounded-lg border border-indigo-300 bg-indigo-50 p-3">
          <div className="text-sm font-medium text-indigo-900">将要 upsert：</div>

          {preview.wallets.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-indigo-800 mb-1">
                钱包（{preview.wallets.length}）
              </div>
              <ul className="space-y-1 text-xs">
                {preview.wallets.map((w, i) => (
                  <li key={i} className="font-mono text-indigo-900">
                    {w.label} · {w.chain} · {w.address.slice(0, 10)}…{w.address.slice(-4)} · {w.holderType}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.banks.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-indigo-800 mb-1">
                银行账户（{preview.banks.length}）
              </div>
              <ul className="space-y-1 text-xs">
                {preview.banks.map((b, i) => (
                  <li key={i} className="text-indigo-900">
                    {b.label} · {b.bankName} · {b.accountNumber} · {b.accountType} · {b.currency}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.employees && preview.employees.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-indigo-800 mb-1">
                员工（{preview.employees.length}） · 含薪资 {preview.counts.salaryRowsParsed ?? 0} 行
              </div>
              <ul className="space-y-1 text-xs max-h-48 overflow-y-auto">
                {preview.employees.map((e, i) => (
                  <li key={i} className="text-indigo-900">
                    {e.chineseName || e.title}
                    {e.englishName ? ` (${e.englishName})` : ''}
                    {e.employmentType ? ` · ${e.employmentType}` : ''}
                    {e.monthlySalary ? ` · ${e.monthlySalary} ${e.currency ?? ''}` : ''}
                    {' · '}
                    <span className={e.status === 'RESIGNED' ? 'text-slate-500' : 'text-emerald-700'}>
                      {e.status === 'RESIGNED' ? '离职' : '在职'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.companies && preview.companies.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-indigo-800 mb-1">
                公司实体（{preview.companies.length}）
              </div>
              <ul className="space-y-1 text-xs max-h-48 overflow-y-auto">
                {preview.companies.map((c, i) => (
                  <li key={i} className="text-indigo-900">
                    {c.title}
                    {c.jurisdiction ? ` · ${c.jurisdiction}` : ''}
                    {c.relationToLty ? ` · ${c.relationToLty}` : ''}
                    {' · '}
                    <span
                      className={
                        c.status === 'CLOSED'
                          ? 'text-slate-400'
                          : c.status === 'PRIVATE_MATTER'
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }
                    >
                      {c.status === 'CLOSED' ? '已关闭' : c.status === 'PRIVATE_MATTER' ? '私人' : '在用'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-[11px] text-indigo-700">
            读自 lty-vault repo 的 wiki/entities/ 目录。upsert 不会重复 —— 已存在按 (chain,address) 或 (bankName,accountNumber) 更新。
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending || preview.counts.wallets + preview.counts.banks === 0}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {pending
                ? '导入中...'
                : `✅ 确认导入 ${
                    preview.counts.wallets +
                    preview.counts.banks +
                    (preview.counts.employees ?? 0) +
                    (preview.counts.companies ?? 0)
                  } 条`}
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
            ✅ 已导入 {result.wallets} 钱包 + {result.banks} 银行账户
            {result.employees ? ` + ${result.employees} 员工` : ''}
            {result.companies ? ` + ${result.companies} 公司实体` : ''}
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
