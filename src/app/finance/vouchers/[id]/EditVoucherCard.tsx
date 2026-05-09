'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const CURRENCY_OPTIONS = ['USDT', 'USDC', 'USD', 'HKD', 'CNY', 'RMB'];

const COMMON_ACCOUNTS = [
  '其他货币资金-USDT钱包',
  '其他货币资金-USDC钱包',
  '其他货币资金-HKD银行',
  '其他货币资金-CNY银行',
  '其他货币资金-Aave',
  '银行存款-工商银行',
  '银行存款-宁波银行',
  '银行存款-HSBC',
  '管理费用-办公费',
  '管理费用-差旅费',
  '管理费用-水电费',
  '管理费用-办公场所租金',
  '应付职工薪酬',
  '应付职工薪酬-小许',
  '其他应收款-员工垫付-小许',
  '其他应收款-员工垫付',
  '主营业务收入',
  '财务费用-汇兑损益',
];

type Initial = {
  id: string;
  date: string;
  summary: string;
  debitAccount: string;
  creditAccount: string;
  amount: string;
  currency: string;
  notes: string | null;
  relatedTxIdsArr: string[];
};

export function EditVoucherCard({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(initial.date);
  const [summary, setSummary] = useState(initial.summary);
  const [debitAccount, setDebitAccount] = useState(initial.debitAccount);
  const [creditAccount, setCreditAccount] = useState(initial.creditAccount);
  const [amount, setAmount] = useState(initial.amount);
  const [currency, setCurrency] = useState(initial.currency);
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [relatedTxIdsRaw, setRelatedTxIdsRaw] = useState(initial.relatedTxIdsArr.join('\n'));

  function reset() {
    setDate(initial.date);
    setSummary(initial.summary);
    setDebitAccount(initial.debitAccount);
    setCreditAccount(initial.creditAccount);
    setAmount(initial.amount);
    setCurrency(initial.currency);
    setNotes(initial.notes ?? '');
    setRelatedTxIdsRaw(initial.relatedTxIdsArr.join('\n'));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const relatedTxIds = relatedTxIdsRaw
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const payload: Record<string, unknown> = { action: 'edit' };
      if (date !== initial.date) payload.date = new Date(date + 'T00:00:00.000Z').toISOString();
      if (summary !== initial.summary) payload.summary = summary.trim();
      if (debitAccount !== initial.debitAccount) payload.debitAccount = debitAccount.trim();
      if (creditAccount !== initial.creditAccount) payload.creditAccount = creditAccount.trim();
      if (amount !== initial.amount) payload.amount = Number(amount);
      if (currency !== initial.currency) payload.currency = currency;
      if ((notes || null) !== (initial.notes || null)) payload.notes = notes.trim() || null;
      const initialIds = initial.relatedTxIdsArr;
      const sameIds =
        relatedTxIds.length === initialIds.length &&
        relatedTxIds.every((v, i) => v === initialIds[i]);
      if (!sameIds) payload.relatedTxIds = relatedTxIds;

      if (Object.keys(payload).length === 1) {
        setError('没有改动');
        setSubmitting(false);
        return;
      }

      const res = await fetch(`/api/finance/vouchers/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg =
          j?.error === 'VALIDATION_FAILED'
            ? `字段校验失败：${j?.issues?.map((i: { path: unknown[]; message: string }) => `${i.path.join('.')} ${i.message}`).join('; ')}`
            : j?.hint || j?.error || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
      >
        ✏️ 修改字段
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-200/80 bg-amber-50/30 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-amber-800">修改凭证字段</h3>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-xs text-slate-500 hover:underline"
        >
          收起
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <datalist id="account-options-edit">
          {COMMON_ACCOUNTS.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="日期">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="币种">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="摘要">
          <input
            maxLength={500}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="用途科目 (借方)">
            <input
              maxLength={100}
              list="account-options-edit"
              value={debitAccount}
              onChange={(e) => setDebitAccount(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </Field>
          <Field label="扣自科目 (贷方)">
            <input
              maxLength={100}
              list="account-options-edit"
              value={creditAccount}
              onChange={(e) => setCreditAccount(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </Field>
        </div>

        <Field label="金额">
          <input
            type="number"
            step="0.01"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
          />
        </Field>

        <Field label="备注">
          <textarea
            maxLength={1000}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>

        <Field label="关联链上交易 / 流水" hint="一行一个 hash">
          <textarea
            rows={2}
            value={relatedTxIdsRaw}
            onChange={(e) => setRelatedTxIdsRaw(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
          />
        </Field>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            ❌ {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              reset();
              setOpen(false);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-50"
          >
            {submitting ? '保存中…' : '保存修改'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline gap-1.5">
        <span className="text-xs font-medium text-slate-700">{label}</span>
        {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
