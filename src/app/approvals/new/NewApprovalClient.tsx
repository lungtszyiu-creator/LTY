'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  parseFields, parseFlow, APPROVAL_CATEGORY_META,
  CURRENCY_META, LEAVE_BALANCE_CATEGORIES,
  parseMoneyValue, parseLeaveBalanceValue,
  findLeaveCategoryField,
  OVERTIME_HOURS_PER_COMP_DAY,
  type Currency, type FormFieldSpec,
} from '@/lib/approvalFlow';
import BottomSheet from '@/components/BottomSheet';
import LeaveCategoryPicker from './LeaveCategoryPicker';

type Tpl = {
  id: string;
  name: string;
  icon: string | null;
  category: string;
  description: string | null;
  flowJson: string;
  fieldsJson: string;
};

type Balances = { annual: number; comp: number };

// DingTalk-style H5 layout: each form field is its own row with a thin
// divider between, label on the left (or top for multi-line fields),
// value/input on the right. Selects open a bottom sheet instead of a
// native dropdown so mobile users get a clean tap-to-pick experience;
// leave-category selects also show remaining balance per option.
export default function NewApprovalClient({ template, myBalances }: { template: Tpl; myBalances: Balances }) {
  const router = useRouter();
  const fields = parseFields(template.fieldsJson);
  const flow = parseFlow(template.flowJson);

  const [values, setValues] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const approvalNodes = flow.nodes.filter((n) => n.type === 'approval');
  const ccNodes = flow.nodes.filter((n) => n.type === 'cc');

  // For OVERTIME templates we auto-compute duration from the two
  // datetime fields (开始时间 + 结束时间). This drives both the form
  // preview ("加班 X 小时 = Y 天调休") and the terminal credit hook.
  const otDatetimes = template.category === 'OVERTIME'
    ? fields.filter((f) => f.type === 'datetime')
    : [];
  const otStart = otDatetimes.find((f) => /开始/.test(f.label)) ?? otDatetimes[0];
  const otEnd = otDatetimes.find((f) => /结束/.test(f.label)) ?? otDatetimes[1];
  let otHours: number | null = null;
  if (otStart && otEnd && values[otStart.id] && values[otEnd.id]) {
    const t1 = new Date(values[otStart.id]).getTime();
    const t2 = new Date(values[otEnd.id]).getTime();
    if (!Number.isNaN(t1) && !Number.isNaN(t2) && t2 > t1) {
      otHours = +((t2 - t1) / 3600000).toFixed(2);
    }
  }
  const otCompDays = otHours != null ? +(otHours / OVERTIME_HOURS_PER_COMP_DAY).toFixed(2) : null;

  function update(id: string, v: any) {
    setValues((prev) => ({ ...prev, [id]: v }));
  }

  // Single source of truth for "is field empty" — used by required-check,
  // submit validation, and the "show approval flow when ready" gate.
  function isEmpty(f: FormFieldSpec, v: any): boolean {
    if (v === undefined || v === null || v === '') return true;
    if (Array.isArray(v) && v.length === 0) return true;
    if (f.type === 'money' && typeof v === 'object') {
      return v.amount === undefined || v.amount === null || v.amount === '';
    }
    if (f.type === 'leave_balance' && typeof v === 'object') {
      return !v.category || v.days === undefined || v.days === null || v.days === '';
    }
    if (f.type === 'daterange' && Array.isArray(v)) {
      return !v[0] || !v[1];
    }
    return false;
  }

  const requiredFilled = useMemo(
    () => fields.filter((f) => f.required).every((f) => !isEmpty(f, values[f.id])),
    [fields, values]
  );

  async function submit() {
    for (const f of fields) {
      if (f.required && isEmpty(f, values[f.id])) {
        setErr(`"${f.label}" 是必填项`);
        return;
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
    <div className="space-y-4 pb-24">
      {/* Template header */}
      <div className="card flex items-center gap-3 p-4 sm:p-5">
        <span className="text-2xl">{template.icon ?? meta.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold">{template.name}</div>
          <div className="text-xs text-slate-500">{meta.label}{template.description ? ` · ${template.description}` : ''}</div>
        </div>
      </div>

      {/* Form — rows with dividers, H5 style */}
      {fields.length === 0 ? (
        <div className="card p-5 text-center text-sm text-slate-500">该模板没有额外字段，直接提交即可。</div>
      ) : (
        <div className="card divide-y divide-slate-100 overflow-hidden">
          {fields.map((f) => (
            <FieldRow
              key={f.id}
              field={f}
              value={values[f.id]}
              update={(v) => update(f.id, v)}
              allValues={values}
              allFields={fields}
              balances={myBalances}
            />
          ))}
        </div>
      )}

      {/* Overtime duration preview — shows only when both datetimes set */}
      {template.category === 'OVERTIME' && otHours !== null && otCompDays !== null && (
        <div className="card flex flex-wrap items-center gap-2 p-4 text-sm ring-2 ring-emerald-200">
          <span className="text-slate-600">本次加班：</span>
          <span className="text-base font-semibold text-slate-900">{otHours} 小时</span>
          <span className="text-slate-400">→</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-emerald-900 ring-1 ring-emerald-300">
            审批通过后 +{otCompDays} 天调休
          </span>
          <span className="w-full text-[11px] text-slate-500">（按 1 天 = {OVERTIME_HOURS_PER_COMP_DAY} 小时折算）</span>
        </div>
      )}

      {/* Approval flow preview — grayed until required fields filled */}
      <div className={`card p-4 sm:p-5 ${requiredFilled ? '' : 'bg-slate-50 text-slate-400'}`}>
        <div className={`mb-2 text-sm font-semibold ${requiredFilled ? 'text-slate-800' : 'text-slate-500'}`}>
          审批流程
        </div>
        {!requiredFilled ? (
          <p className="text-xs">必填信息填写完整后，将显示审批流程</p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded bg-sky-100 px-2 py-0.5 text-sky-700">🚀 发起</span>
            {approvalNodes.map((n, i) => (
              <span key={n.id} className="flex items-center gap-1">
                <span className="text-slate-400">→</span>
                <span className="rounded bg-white px-2 py-0.5 ring-1 ring-slate-200 text-slate-700">
                  👤 {n.data.label || `审批 ${i + 1}`} · {n.data.mode === 'ANY' ? '或签' : '会签'}
                </span>
              </span>
            ))}
            {ccNodes.length > 0 && (
              <span className="flex items-center gap-1">
                <span className="text-slate-400">→</span>
                <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">📨 抄送 ({ccNodes.length})</span>
              </span>
            )}
            <span className="text-slate-400">→</span>
            <span className="rounded bg-slate-200 px-2 py-0.5 text-slate-700">🏁 结束</span>
          </div>
        )}
      </div>

      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>
      )}

      {/* Fixed bottom submit — imitates H5 ticket-app feel */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm shadow-[0_-4px_16px_-4px_rgba(0,0,0,0.08)]"
           style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        <div className="mx-auto max-w-6xl">
          <button
            onClick={submit}
            disabled={busy}
            className="w-full rounded-xl bg-indigo-600 px-4 py-3.5 text-base font-semibold text-white shadow-md transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? '提交中…' : '提交'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Row components ----------

function FieldRow({
  field, value, update, allValues, allFields, balances,
}: {
  field: FormFieldSpec;
  value: any;
  update: (v: any) => void;
  allValues: Record<string, any>;
  allFields: FormFieldSpec[];
  balances: Balances;
}) {
  // Leave-category select gets the special picker with balance-in-option.
  const isLeaveCategory = field.type === 'select' && Array.isArray(field.options) &&
    field.options.some((o) => (LEAVE_BALANCE_CATEGORIES as readonly string[]).includes(o));

  if (isLeaveCategory) {
    return (
      <LeaveCategoryPicker
        label={field.label}
        required={field.required}
        value={value ?? ''}
        onChange={update}
        options={field.options ?? []}
        balances={balances}
      />
    );
  }

  if (field.type === 'select') {
    return (
      <GenericSelectRow
        label={field.label}
        required={field.required}
        value={value ?? ''}
        options={field.options ?? []}
        onChange={update}
      />
    );
  }

  if (field.type === 'text') {
    return (
      <CompactRow label={field.label} required={field.required}>
        <input
          value={value ?? ''}
          onChange={(e) => update(e.target.value)}
          placeholder={field.placeholder ?? '请输入'}
          className="flex-1 min-w-0 bg-transparent text-right text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
      </CompactRow>
    );
  }

  if (field.type === 'number') {
    return (
      <CompactRow label={field.label} required={field.required}>
        <input
          type="number"
          value={value ?? ''}
          onChange={(e) => update(e.target.value)}
          placeholder="请输入"
          className="flex-1 min-w-0 bg-transparent text-right text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
      </CompactRow>
    );
  }

  if (field.type === 'date') {
    return (
      <CompactRow label={field.label} required={field.required}>
        <input
          type="date"
          value={value ?? ''}
          onChange={(e) => update(e.target.value)}
          className="bg-transparent text-right text-[15px] text-slate-900 focus:outline-none"
        />
      </CompactRow>
    );
  }

  if (field.type === 'datetime') {
    return (
      <CompactRow label={field.label} required={field.required}>
        <input
          type="datetime-local"
          value={value ?? ''}
          onChange={(e) => update(e.target.value)}
          className="bg-transparent text-right text-[15px] text-slate-900 focus:outline-none"
        />
      </CompactRow>
    );
  }

  if (field.type === 'daterange') {
    return (
      <StackedRow label={field.label} required={field.required}>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={value?.[0] ?? ''}
            onChange={(e) => update([e.target.value, value?.[1] ?? ''])}
            className="input"
          />
          <span className="text-slate-400">至</span>
          <input
            type="date"
            value={value?.[1] ?? ''}
            onChange={(e) => update([value?.[0] ?? '', e.target.value])}
            className="input"
          />
        </div>
      </StackedRow>
    );
  }

  if (field.type === 'textarea') {
    return (
      <StackedRow label={field.label} required={field.required}>
        <textarea
          value={value ?? ''}
          onChange={(e) => update(e.target.value)}
          rows={3}
          placeholder={field.placeholder ?? '请输入'}
          className="w-full bg-transparent text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
      </StackedRow>
    );
  }

  if (field.type === 'multiselect') {
    return (
      <StackedRow label={field.label} required={field.required}>
        <div className="flex flex-wrap gap-1.5">
          {(field.options ?? []).map((o) => {
            const arr: string[] = value ?? [];
            const on = arr.includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => update(on ? arr.filter((x) => x !== o) : [...arr, o])}
                className={`rounded-full px-3 py-1 text-xs transition ${on ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
              >
                {o}
              </button>
            );
          })}
        </div>
      </StackedRow>
    );
  }

  if (field.type === 'money') {
    return (
      <StackedRow label={field.label} required={field.required}>
        <MoneyInput field={field} value={value} update={update} />
      </StackedRow>
    );
  }

  if (field.type === 'leave_days') {
    return (
      <StackedRow label={field.label} required={field.required}>
        <LeaveDaysInput
          value={value}
          update={update}
          allValues={allValues}
          allFields={allFields}
          balances={balances}
        />
      </StackedRow>
    );
  }

  if (field.type === 'leave_balance') {
    // Legacy bundle — keep working, but encourage admins to upgrade to the
    // new split via the editor's amber banner.
    return (
      <StackedRow label={field.label} required={field.required}>
        <LegacyLeaveBalanceInput
          field={field}
          value={value}
          update={update}
          allValues={allValues}
          allFields={allFields}
          balances={balances}
        />
      </StackedRow>
    );
  }

  if (field.type === 'overtime_hours') {
    return (
      <StackedRow label={field.label} required={field.required}>
        <OvertimeHoursInput value={value} update={update} />
      </StackedRow>
    );
  }

  // Fallback — unsupported type, just show a greyed text
  return (
    <StackedRow label={field.label} required={field.required}>
      <div className="text-xs text-slate-400">暂不支持该字段类型的编辑（{field.type}）</div>
    </StackedRow>
  );
}

function CompactRow({
  label, required, children,
}: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 bg-white px-4 py-3.5">
      <div className="text-[15px] text-slate-900 whitespace-nowrap">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </div>
      <div className="flex-1 flex items-center justify-end gap-2">
        {children}
      </div>
    </div>
  );
}

function StackedRow({
  label, required, children,
}: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="bg-white px-4 py-3.5">
      <div className="mb-2 text-[15px] text-slate-900">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </div>
      {children}
    </div>
  );
}

// ---------- Generic select (non-leave) with bottom sheet ----------

function GenericSelectRow({
  label, required, value, options, onChange,
}: {
  label: string; required?: boolean; value: string; options: string[]; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 bg-white px-4 py-3.5 text-left transition active:bg-slate-50"
      >
        <span className="text-[15px] text-slate-900">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </span>
        <span className="flex items-center gap-1 text-[15px]">
          <span className={value ? 'text-slate-900' : 'text-slate-400'}>{value || '请选择'}</span>
          <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </button>
      <BottomSheet open={open} title={label} onClose={() => setOpen(false)}>
        <ul className="divide-y divide-slate-100">
          {options.map((opt) => (
            <li key={opt}>
              <button
                type="button"
                onClick={() => { onChange(opt); setOpen(false); }}
                className={`flex w-full items-center justify-between px-5 py-4 text-left transition active:bg-slate-100 ${value === opt ? 'bg-indigo-50' : ''}`}
              >
                <span className={`text-[15px] ${value === opt ? 'font-semibold text-indigo-900' : 'text-slate-900'}`}>{opt}</span>
                {value === opt && (
                  <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </>
  );
}

// ---------- Specialized inputs (extracted from the old renderer) ----------

function MoneyInput({
  field, value, update,
}: {
  field: FormFieldSpec; value: any; update: (v: any) => void;
}) {
  const parsed = parseMoneyValue(value, (field.defaultCurrency ?? 'CNY') as Currency);
  const currency: Currency = parsed.currency;
  const allowSwitch = field.allowCurrencySwitch !== false;
  const sym = CURRENCY_META[currency].symbol;

  // Keep this dead-simple: the global `.input` class is battle-tested
  // across the app (display:block, width:100%). Anything fancier has bitten
  // us with collapsed inputs on narrow phones. Currency symbol lives in the
  // placeholder so no absolute/flex tricks can break the input box.
  return (
    <div className="space-y-2">
      <input
        type="number"
        step="0.01"
        inputMode="decimal"
        value={parsed.amount ?? ''}
        onChange={(e) => update({ amount: e.target.value === '' ? '' : Number(e.target.value), currency })}
        className="input"
        placeholder={`${sym}  请输入金额`}
      />
      {allowSwitch ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500">币种：</span>
          {(Object.keys(CURRENCY_META) as Currency[]).map((c) => {
            const on = currency === c;
            const short = c === 'CNY' ? 'RMB' : c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => update({ amount: parsed.amount ?? '', currency: c })}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  on ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
                }`}
              >
                {CURRENCY_META[c].icon} {short}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="text-xs text-slate-500">
          币种：{CURRENCY_META[currency].icon} {CURRENCY_META[currency].label}
        </div>
      )}
    </div>
  );
}

function LeaveDaysInput({
  value, update, allValues, allFields, balances,
}: {
  value: any; update: (v: any) => void;
  allValues: Record<string, any>; allFields: FormFieldSpec[]; balances: Balances;
}) {
  const days = value === '' || value == null ? null : Number(value);

  const rangeField = allFields.find((x) => x.type === 'daterange');
  const rangeVal = rangeField ? allValues[rangeField.id] : undefined;
  let autoDays: number | null = null;
  if (Array.isArray(rangeVal) && rangeVal[0] && rangeVal[1]) {
    const d1 = new Date(rangeVal[0] as string).getTime();
    const d2 = new Date(rangeVal[1] as string).getTime();
    if (!Number.isNaN(d1) && !Number.isNaN(d2) && d2 >= d1) {
      autoDays = Math.round((d2 - d1) / 86400000) + 1;
    }
  }

  const catField = findLeaveCategoryField(allFields);
  const category = catField ? (allValues[catField.id] ?? '') : '';
  const pool = category === '年假' ? 'annual' : category === '调休' ? 'comp' : null;
  const official = pool === 'annual' ? balances.annual : pool === 'comp' ? balances.comp : null;

  const QUICK_DAYS = [0.5, 1, 2, 3, 5, 7, 10];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 ring-2 ring-indigo-300">
          <button
            type="button"
            onClick={() => update(Math.max(0, (Number(days) || 0) - 0.5))}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-lg font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
          >−</button>
          <input
            type="number" min="0" step="0.5"
            value={days ?? ''}
            onChange={(e) => update(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-20 border-0 bg-transparent p-0 text-center text-lg font-bold text-slate-900 outline-none"
            placeholder="0"
          />
          <span className="text-sm text-slate-600">天</span>
          <button
            type="button"
            onClick={() => update((Number(days) || 0) + 0.5)}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-lg font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
          >+</button>
        </div>
        {autoDays !== null && (
          <button
            type="button"
            onClick={() => update(autoDays)}
            className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
              days === autoDays ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100'
            }`}
          >
            📅 按起止日期算 = {autoDays} 天
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-500">快捷：</span>
        {QUICK_DAYS.map((d) => {
          const on = Number(days) === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => update(d)}
              className={`rounded-full px-3 py-1 text-xs transition ${on ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'}`}
            >
              {d === 0.5 ? '半天' : `${d} 天`}
            </button>
          );
        })}
      </div>
      {pool && official !== null && days != null && (
        <div className={`rounded-lg px-3 py-2 text-xs ring-1 ${
          official - days < 0 ? 'bg-rose-50 text-rose-800 ring-rose-200' : 'bg-emerald-50 text-emerald-800 ring-emerald-200'
        }`}>
          当前 {category} {official.toFixed(1)} 天 · 本次申请 {days} 天 · 通过后 {(official - days).toFixed(1)} 天
          {official - days < 0 && <span className="ml-1">（余额不足，将由管理员决定）</span>}
        </div>
      )}
    </div>
  );
}

function LegacyLeaveBalanceInput({
  field, value, update, allValues, allFields, balances,
}: {
  field: FormFieldSpec;
  value: any; update: (v: any) => void;
  allValues: Record<string, any>; allFields: FormFieldSpec[]; balances: Balances;
}) {
  const parsed = parseLeaveBalanceValue(value);
  const boundPool = parsed.category === '年假' ? 'annual' : parsed.category === '调休' ? 'comp' : null;
  const officialBalance = boundPool === 'annual' ? balances.annual : boundPool === 'comp' ? balances.comp : null;

  const patch = (p: Partial<{ category: string; days: any; balance: any }>) => {
    const next: any = { category: parsed.category, days: parsed.days, balance: parsed.balance, ...p };
    if (next.category === '年假') next.balance = balances.annual;
    else if (next.category === '调休') next.balance = balances.comp;
    else next.balance = null;
    update(next);
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500">⚠️ 这是旧版合并字段，建议让管理员点"升级为类型+天数独立字段"后再提交</div>
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
      <input
        type="number" min="0" step="0.5"
        value={parsed.days ?? ''}
        onChange={(e) => patch({ days: e.target.value === '' ? '' : Number(e.target.value) })}
        className="input"
        placeholder="申请天数"
      />
      {boundPool && officialBalance !== null && (
        <div className="text-xs text-slate-600">当前 {parsed.category} 余额 {officialBalance.toFixed(1)} 天</div>
      )}
    </div>
  );
}

function OvertimeHoursInput({
  value, update,
}: {
  value: any; update: (v: any) => void;
}) {
  const h = value === '' || value == null ? null : Number(value);
  const compDays = h != null && !Number.isNaN(h) ? +(h / OVERTIME_HOURS_PER_COMP_DAY).toFixed(2) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 ring-2 ring-indigo-300">
          <input
            type="number" min="0" step="0.5"
            value={value ?? ''}
            onChange={(e) => update(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-24 border-0 bg-transparent p-0 text-center text-lg font-bold text-slate-900 outline-none"
            placeholder="0"
          />
          <span className="text-sm text-slate-600">小时</span>
        </div>
        {compDays !== null && (
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900 ring-1 ring-emerald-200">
            审批通过 → <strong>+{compDays} 天</strong> 调休（1 天 = {OVERTIME_HOURS_PER_COMP_DAY} 小时）
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-500">快捷：</span>
        {[2, 4, 6, 8, 12].map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => update(q)}
            className={`rounded-full px-3 py-1 text-xs transition ${
              Number(value) === q ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
            }`}
          >
            {q} 小时
          </button>
        ))}
      </div>
    </div>
  );
}
