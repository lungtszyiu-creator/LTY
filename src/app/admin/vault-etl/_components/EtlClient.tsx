'use client';

/**
 * Vault ETL UI client
 *
 * 两个按钮：
 *   - 🧪 Dry-run（默认）— 不写库，只看会建多少
 *   - 🚀 真跑 — 写入 DB（带 confirm）
 *
 * 跑完显示 5 个 bucket 的 created/updated/skipped/errors。
 */
import { useState, useTransition } from 'react';

type Bucket = { created: number; updated: number; skipped: number; errors: string[] };
type Report = {
  dryRun: boolean;
  employees: Bucket;
  payroll: Bucket;
  hrProfile: Bucket;
  wallets: Bucket;
  banks: Bucket;
  durationMs: number;
};

export function EtlClient() {
  const [pending, startTransition] = useTransition();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(dryRun: boolean) {
    if (!dryRun) {
      const ok = confirm(
        '真跑会写入看板 DB（员工 / 钱包 / 银行账户都会建/更新行）。\n' +
          '建议先跑 Dry-run 确认范围。继续吗？',
      );
      if (!ok) return;
    }
    setError(null);
    setReport(null);
    startTransition(async () => {
      try {
        const r = await fetch('/api/vault/etl-once', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dryRun }),
        });
        const j = await r.json();
        if (!r.ok) {
          setError(j.hint ?? j.error ?? `HTTP ${r.status}`);
          return;
        }
        setReport(j.report);
      } catch (e) {
        setError(e instanceof Error ? e.message : '未知错误');
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => run(true)}
          disabled={pending}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {pending && report?.dryRun !== false ? '跑中…' : '🧪 Dry-run（不写库）'}
        </button>
        <button
          type="button"
          onClick={() => run(false)}
          disabled={pending}
          className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-amber-50 transition hover:bg-rose-800 disabled:opacity-50"
        >
          {pending && report?.dryRun === false ? '导入中…' : '🚀 真跑（写入 DB）'}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-300">
          ❌ {error}
        </div>
      )}

      {report && <ReportView report={report} />}
    </div>
  );
}

function ReportView({ report }: { report: Report }) {
  return (
    <div className="mt-5 space-y-3">
      <div
        className={`rounded-lg px-3 py-2 text-sm font-medium ${
          report.dryRun
            ? 'bg-sky-100 text-sky-900 ring-1 ring-sky-300'
            : 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300'
        }`}
      >
        {report.dryRun
          ? '✅ Dry-run 跑完（DB 没改） — 跑了 ' + report.durationMs + ' ms'
          : '🚀 真跑完毕 — 跑了 ' + report.durationMs + ' ms'}
      </div>

      <BucketCard title="👥 用户 (User)" bucket={report.employees} />
      <BucketCard title="📋 HR 档案 (HrEmployeeProfile)" bucket={report.hrProfile} />
      <BucketCard title="💰 工资档案 (EmployeePayrollProfile)" bucket={report.payroll} />
      <BucketCard title="🪙 加密钱包 (CryptoWallet)" bucket={report.wallets} />
      <BucketCard title="🏦 银行账户 (BankAccount)" bucket={report.banks} />

      {!report.dryRun && (
        <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-100/50 p-3 text-sm text-emerald-900">
          🎉 数据已落看板。马上去看：
          <a href="/dept/hr" className="ml-2 font-medium underline">
            /dept/hr 人事部
          </a>
          <span className="mx-1.5">·</span>
          <a href="/finance" className="font-medium underline">
            /finance 财务部
          </a>
        </div>
      )}
    </div>
  );
}

function BucketCard({ title, bucket }: { title: string; bucket: Bucket }) {
  const total = bucket.created + bucket.updated + bucket.skipped;
  if (total === 0 && bucket.errors.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-400">
        {title} — 没动
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <strong className="text-sm text-slate-800">{title}</strong>
        <div className="flex flex-wrap gap-2 font-mono text-xs tabular-nums">
          {bucket.created > 0 && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800 ring-1 ring-emerald-300">
              新建 {bucket.created}
            </span>
          )}
          {bucket.updated > 0 && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800 ring-1 ring-sky-300">
              更新 {bucket.updated}
            </span>
          )}
          {bucket.skipped > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 ring-1 ring-slate-300">
              跳过 {bucket.skipped}
            </span>
          )}
          {bucket.errors.length > 0 && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800 ring-1 ring-rose-300">
              错误 {bucket.errors.length}
            </span>
          )}
        </div>
      </div>
      {bucket.errors.length > 0 && (
        <ul className="mt-2 space-y-1 rounded bg-rose-50 p-2 text-[11px] text-rose-800">
          {bucket.errors.map((e, i) => (
            <li key={i} className="font-mono">
              · {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
