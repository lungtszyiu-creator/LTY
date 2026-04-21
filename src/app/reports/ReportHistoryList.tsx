'use client';

import { useState } from 'react';
import { fmtDateTime } from '@/lib/datetime';

type Item = {
  id: string;
  periodLabel: string;
  status: string;
  submittedAt: string | null;
  contentDone: string | null;
  contentPlan: string | null;
  contentBlockers: string | null;
  contentAsks: string | null;
  reportToName: string | null;
};

export default function ReportHistoryList({
  items,
  emptyMessage = '暂无历史记录',
}: {
  items: Item[];
  emptyMessage?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (items.length === 0) {
    return <div className="card py-10 text-center text-sm text-slate-500">{emptyMessage}</div>;
  }

  return (
    <ul className="space-y-2">
      {items.map((r) => {
        const isOpen = openId === r.id;
        return (
          <li key={r.id} className="card">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : r.id)}
              className="flex w-full items-center justify-between gap-2 p-4 text-left text-sm hover:bg-slate-50"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-medium">{r.periodLabel}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ${
                  r.status === 'SUBMITTED' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' :
                  r.status === 'LATE' ? 'bg-rose-50 text-rose-700 ring-rose-200' :
                  'bg-slate-100 text-slate-500 ring-slate-200'
                }`}>
                  {r.status === 'SUBMITTED' ? '已提交' : r.status === 'LATE' ? '逾期提交' : '未提交'}
                </span>
                {r.submittedAt && <span className="text-xs text-slate-500">{fmtDateTime(r.submittedAt)}</span>}
                {r.reportToName && <span className="text-xs text-slate-500">· 汇报给 {r.reportToName}</span>}
              </div>
              <span className="text-xs text-slate-400">{isOpen ? '▲ 收起' : '▼ 展开'}</span>
            </button>
            {isOpen && (
              <div className="space-y-2 border-t border-slate-100 p-4">
                {r.contentDone && <Block label="本期完成" value={r.contentDone} />}
                {r.contentPlan && <Block label="下期计划" value={r.contentPlan} />}
                {r.contentBlockers && <Block label="遇到问题" value={r.contentBlockers} />}
                {r.contentAsks && <Block label="需要支持" value={r.contentAsks} />}
                {!r.contentDone && !r.contentPlan && !r.contentBlockers && !r.contentAsks && (
                  <div className="text-center text-xs text-slate-400">（未填写内容）</div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Block({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-100">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{value}</div>
    </div>
  );
}
