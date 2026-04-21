'use client';

import { useState } from 'react';
import BottomSheet from '@/components/BottomSheet';
import { OVERTIME_HOURS_PER_COMP_DAY } from '@/lib/approvalFlow';

type Balances = { annual: number; comp: number };

// Row-style "tap to open sheet" picker modeled after DingTalk/H5 leave
// forms: label on the left, selected value (or placeholder) on the right
// with a chevron, and a bottom sheet that lists each option with its
// remaining balance inline. 年假 displays 天; 调休 displays 小时 (1 天 = 8
// 小时) so employees see granular comp-leave availability.
export default function LeaveCategoryPicker({
  label,
  required,
  value,
  onChange,
  options,
  balances,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  balances: Balances;
}) {
  const [open, setOpen] = useState(false);

  function remainingFor(cat: string): string | null {
    if (cat === '年假') return `剩余 ${balances.annual.toFixed(1)} 天`;
    if (cat === '调休') {
      const hours = balances.comp * OVERTIME_HOURS_PER_COMP_DAY;
      return `剩余 ${hours.toFixed(1)} 小时`;
    }
    return null;
  }

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
        <span className="flex min-w-0 items-center gap-1 text-[15px]">
          <span className={value ? 'text-slate-900' : 'text-slate-400'}>
            {value || '请选择'}
          </span>
          <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </button>

      <BottomSheet open={open} title={label} onClose={() => setOpen(false)}>
        <ul className="divide-y divide-slate-100">
          {options.map((opt) => {
            const remaining = remainingFor(opt);
            const isSelected = value === opt;
            return (
              <li key={opt}>
                <button
                  type="button"
                  onClick={() => { onChange(opt); setOpen(false); }}
                  className={`flex w-full items-center justify-between px-5 py-4 text-left transition active:bg-slate-100 ${
                    isSelected ? 'bg-indigo-50' : ''
                  }`}
                >
                  <span className="flex items-baseline gap-2">
                    <span className={`text-[15px] ${isSelected ? 'font-semibold text-indigo-900' : 'text-slate-900'}`}>
                      {opt}
                    </span>
                    {remaining && (
                      <span className="text-[13px] text-slate-500">
                        （{remaining}）
                      </span>
                    )}
                  </span>
                  {isSelected && (
                    <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </BottomSheet>
    </>
  );
}
