'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const CURRENCY_OPTIONS = ['USDT', 'USDC', 'USD', 'HKD', 'CNY', 'RMB'];

// 常用科目（datalist 自动补全用，不限制必须从这里选）
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

function todayISODate(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export function CreateVoucherForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(todayISODate());
  const [summary, setSummary] = useState('');
  const [debitAccount, setDebitAccount] = useState('');
  const [creditAccount, setCreditAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USDT');
  const [notes, setNotes] = useState('');
  const [relatedTxIdsRaw, setRelatedTxIdsRaw] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const relatedTxIds = relatedTxIdsRaw
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        date: new Date(date + 'T00:00:00.000Z').toISOString(),
        summary: summary.trim(),
        debitAccount: debitAccount.trim(),
        creditAccount: creditAccount.trim(),
        amount: Number(amount),
        currency,
        notes: notes.trim() || null,
        relatedTxIds: relatedTxIds.length > 0 ? relatedTxIds : undefined,
      };
      const res = await fetch('/api/finance/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg =
          j?.error === 'VALIDATION_FAILED'
            ? `字段校验失败：${j?.issues?.map((i: { path: unknown[]; message: string }) => `${i.path.join('.')} ${i.message}`).join('; ')}`
            : j?.error || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      const v = (await res.json()) as { id: string };
      router.push(`/finance/vouchers/${v.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <datalist id="account-options">
        {COMMON_ACCOUNTS.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="日期" required>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="币种" required>
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

      <Field label="摘要" required hint="一句话说清楚是什么业务（如 4 月房租 36000 HKD 已转 HSBC）">
        <input
          required
          maxLength={500}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="例如：换汇 MSO USDT→HKD 96240.22 USDT 换 750000 HKD（含测试 + 尾款）"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="借方科目" required hint="资产增加 / 费用增加 / 负债减少">
          <input
            required
            maxLength={100}
            list="account-options"
            value={debitAccount}
            onChange={(e) => setDebitAccount(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            placeholder="例如：其他货币资金-HKD银行"
          />
        </Field>
        <Field label="贷方科目" required hint="资产减少 / 收入增加 / 负债增加">
          <input
            required
            maxLength={100}
            list="account-options"
            value={creditAccount}
            onChange={(e) => setCreditAccount(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            placeholder="例如：其他货币资金-USDT钱包"
          />
        </Field>
      </div>

      <Field label="金额" required>
        <input
          type="number"
          step="0.01"
          required
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
          placeholder="0.00"
        />
      </Field>

      <Field label="备注" hint="P&L 分析、关联业务说明等可写这里">
        <textarea
          maxLength={1000}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="选填"
        />
      </Field>

      <Field
        label="关联链上交易 / 银行流水"
        hint="一行一个 hash 或交易号；支持逗号分隔。换汇分笔时把测试段 + 尾款两个 hash 都填上"
      >
        <textarea
          rows={2}
          value={relatedTxIdsRaw}
          onChange={(e) => setRelatedTxIdsRaw(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
          placeholder="0xabc...&#10;0xdef..."
        />
      </Field>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          ❌ {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => history.back()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-rose-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
        >
          {submitting ? '创建中…' : '创建草稿凭证'}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline gap-1.5">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {required && <span className="text-xs text-rose-500">*</span>}
        {hint && <span className="ml-1 text-xs text-slate-400">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
