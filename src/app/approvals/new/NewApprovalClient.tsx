'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  parseFields, parseFlow, APPROVAL_CATEGORY_META,
  CURRENCY_META, LEAVE_BALANCE_CATEGORIES,
  parseMoneyValue, parseLeaveBalanceValue,
  type Currency,
} from '@/lib/approvalFlow';

type Tpl = {
  id: string;
  name: string;
  icon: string | null;
  category: string;
  description: string | null;
  flowJson: string;
  fieldsJson: string;
};

export default function NewApprovalClient({ template }: { template: Tpl }) {
  const router = useRouter();
  const fields = parseFields(template.fieldsJson);
  const flow = parseFlow(template.flowJson);

  const [values, setValues] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Summarise approvers from flow for preview
  const approvalNodes = flow.nodes.filter((n) => n.type === 'approval');
  const ccNodes = flow.nodes.filter((n) => n.type === 'cc');

  function update(id: string, v: any) {
    setValues((prev) => ({ ...prev, [id]: v }));
  }

  async function submit() {
    for (const f of fields) {
      if (f.required) {
        const v = values[f.id];
        let empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
        // money + leave_balance use structured shapes; empty-check drills in.
        if (!empty && f.type === 'money' && v && typeof v === 'object') {
          empty = v.amount === undefined || v.amount === null || v.amount === '';
        }
        if (!empty && f.type === 'leave_balance' && v && typeof v === 'object') {
          empty = !v.category || v.days === undefined || v.days === null || v.days === '';
        }
        if (empty) { setErr(`"${f.label}" 是必填项`); return; }
      }
    }
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: template.id, form: values }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? '提交失败');
      }
      const inst = await res.json();
      router.push(`/approvals/${inst.id}`);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const meta = APPROVAL_CATEGORY_META[template.category] ?? APPROVAL_CATEGORY_META.OTHER;

  return (
    <div className="space-y-4">
      <div className="card p-5 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-2xl">{template.icon ?? meta.icon}</span>
          <div>
            <div className="text-base font-semibold">{template.name}</div>
            <div className="text-xs text-slate-500">{meta.label}</div>
          </div>
        </div>
        {template.description && <p className="mb-4 text-sm text-slate-600">{template.description}</p>}

        <div className="mb-5 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-100">
          <div className="mb-1 font-medium">预览流程：</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-sky-100 px-2 py-0.5 text-sky-700">🚀 发起</span>
            {approvalNodes.map((n, i) => (
              <span key={n.id} className="flex items-center gap-1">
                <span>→</span>
                <span className="rounded bg-white px-2 py-0.5 ring-1 ring-slate-200">
                  👤 {n.data.label || `审批 ${i + 1}`} · {n.data.mode === 'ANY' ? '或签' : '会签'}
                </span>
              </span>
            ))}
            {ccNodes.length > 0 && (
              <span className="flex items-center gap-1">
                <span>→</span>
                <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">📨 抄送 ({ccNodes.length})</span>
              </span>
            )}
            <span>→</span>
            <span className="rounded bg-slate-200 px-2 py-0.5 text-slate-700">🏁 结束</span>
          </div>
        </div>

        <div className="space-y-4">
          {fields.length === 0 ? (
            <p className="text-sm text-slate-500">该模板没有额外字段，直接提交即可。</p>
          ) : (
            fields.map((f) => (
              <div key={f.id}>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {f.label} {f.required && <span className="text-rose-500">*</span>}
                </label>
                {f.type === 'text' && (
                  <input value={values[f.id] ?? ''} onChange={(e) => update(f.id, e.target.value)} className="input" placeholder={f.placeholder} />
                )}
                {f.type === 'textarea' && (
                  <textarea value={values[f.id] ?? ''} onChange={(e) => update(f.id, e.target.value)} rows={3} className="textarea" placeholder={f.placeholder} />
                )}
                {f.type === 'number' && (
                  <input type="number" value={values[f.id] ?? ''} onChange={(e) => update(f.id, e.target.value)} className="input" />
                )}
                {f.type === 'money' && (() => {
                  const parsed = parseMoneyValue(values[f.id], (f.defaultCurrency ?? 'CNY') as Currency);
                  const currency: Currency = parsed.currency;
                  const allowSwitch = f.allowCurrencySwitch !== false;
                  const sym = CURRENCY_META[currency].symbol;
                  const setAmount = (amt: string) => update(f.id, { amount: amt === '' ? '' : Number(amt), currency });
                  const setCurrency = (c: Currency) => update(f.id, { amount: parsed.amount ?? '', currency: c });
                  return (
                    <div className="flex items-stretch gap-2">
                      <div className="relative flex-1">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{sym}</span>
                        <input
                          type="number" step="0.01"
                          value={parsed.amount ?? ''}
                          onChange={(e) => setAmount(e.target.value)}
                          className="input pl-10"
                          placeholder="0.00"
                        />
                      </div>
                      {allowSwitch ? (
                        <select
                          value={currency}
                          onChange={(e) => setCurrency(e.target.value as Currency)}
                          className="select w-32 shrink-0"
                        >
                          {Object.entries(CURRENCY_META).map(([k, v]) => (
                            <option key={k} value={k}>{v.icon} {v.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="inline-flex shrink-0 items-center rounded-lg bg-slate-100 px-3 text-sm text-slate-700 ring-1 ring-slate-200">
                          {CURRENCY_META[currency].icon} {CURRENCY_META[currency].label}
                        </span>
                      )}
                    </div>
                  );
                })()}
                {f.type === 'leave_balance' && (() => {
                  const parsed = parseLeaveBalanceValue(values[f.id]);
                  const patch = (p: Partial<{ category: string; days: any; balance: any }>) =>
                    update(f.id, { category: parsed.category, days: parsed.days, balance: parsed.balance, ...p });

                  // Try to auto-compute days from the same form's daterange
                  // field (typical leave template has 请假起止日期). Inclusive
                  // count, calendar days — user can still override manually.
                  const rangeField = fields.find((x) => x.type === 'daterange');
                  const rangeVal = rangeField ? values[rangeField.id] : undefined;
                  let autoDays: number | null = null;
                  if (Array.isArray(rangeVal) && rangeVal[0] && rangeVal[1]) {
                    const d1 = new Date(rangeVal[0] as string).getTime();
                    const d2 = new Date(rangeVal[1] as string).getTime();
                    if (!Number.isNaN(d1) && !Number.isNaN(d2) && d2 >= d1) {
                      autoDays = Math.round((d2 - d1) / 86400000) + 1;
                    }
                  }

                  const QUICK_DAYS = [0.5, 1, 2, 3, 5, 7, 10];
                  return (
                    <div className="space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-slate-500">假期类型</span>
                        <div className="flex flex-wrap gap-1.5">
                          {LEAVE_BALANCE_CATEGORIES.map((c) => {
                            const on = parsed.category === c;
                            return (
                              <button
                                key={c}
                                type="button"
                                onClick={() => patch({ category: c })}
                                className={`rounded-full px-3 py-1 text-xs transition ${on ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
                              >
                                {c}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-xs text-slate-500">本次申请（天）</span>
                          {autoDays !== null && (
                            <button
                              type="button"
                              onClick={() => patch({ days: autoDays })}
                              className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                                parsed.days === autoDays ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                              }`}
                              title="基于起止日期含头尾计算"
                            >
                              📅 按所选日期算：{autoDays} 天
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {QUICK_DAYS.map((d) => {
                            const on = parsed.days === d;
                            return (
                              <button
                                key={d}
                                type="button"
                                onClick={() => patch({ days: d })}
                                className={`rounded-full px-3 py-1 text-xs transition ${on ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'}`}
                              >
                                {d === 0.5 ? '半天' : `${d} 天`}
                              </button>
                            );
                          })}
                          <div className="ml-1 flex items-center gap-1 text-xs text-slate-500">
                            或自定义
                            <input
                              type="number" min="0" step="0.5"
                              value={parsed.days ?? ''}
                              onChange={(e) => patch({ days: e.target.value === '' ? '' : Number(e.target.value) })}
                              className="w-20 rounded-md bg-white px-2 py-0.5 text-sm ring-1 ring-slate-200 focus:ring-slate-400"
                              placeholder="天"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 whitespace-nowrap">当前剩余（天，自报）</span>
                          <input
                            type="number" min="0" step="0.5"
                            value={parsed.balance ?? ''}
                            onChange={(e) => patch({ balance: e.target.value === '' ? '' : Number(e.target.value) })}
                            className="input max-w-[140px]" placeholder="剩余可用天数"
                          />
                          {parsed.days != null && parsed.balance != null && parsed.days > parsed.balance && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700 ring-1 ring-rose-200">
                              ⚠️ 申请超过剩余
                            </span>
                          )}
                        </label>
                      </div>
                    </div>
                  );
                })()}
                {f.type === 'date' && (
                  <input type="date" value={values[f.id] ?? ''} onChange={(e) => update(f.id, e.target.value)} className="input" />
                )}
                {f.type === 'daterange' && (
                  <div className="flex items-center gap-2">
                    <input type="date" value={values[f.id]?.[0] ?? ''} onChange={(e) => update(f.id, [e.target.value, values[f.id]?.[1] ?? ''])} className="input" />
                    <span className="text-slate-500">至</span>
                    <input type="date" value={values[f.id]?.[1] ?? ''} onChange={(e) => update(f.id, [values[f.id]?.[0] ?? '', e.target.value])} className="input" />
                  </div>
                )}
                {f.type === 'select' && (
                  <select value={values[f.id] ?? ''} onChange={(e) => update(f.id, e.target.value)} className="select">
                    <option value="">—— 请选择 ——</option>
                    {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
                {f.type === 'multiselect' && (
                  <div className="flex flex-wrap gap-1.5">
                    {(f.options ?? []).map((o) => {
                      const arr: string[] = values[f.id] ?? [];
                      const on = arr.includes(o);
                      return (
                        <button
                          key={o}
                          type="button"
                          onClick={() => update(f.id, on ? arr.filter((x) => x !== o) : [...arr, o])}
                          className={`rounded-full px-3 py-1 text-xs transition ${on ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
                        >
                          {o}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {err && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}

        <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
          <button onClick={submit} disabled={busy} className="btn btn-primary">
            {busy ? '提交中…' : '提交审批'}
          </button>
        </div>
      </div>
    </div>
  );
}
