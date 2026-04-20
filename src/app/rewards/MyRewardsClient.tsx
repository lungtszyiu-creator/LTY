'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Attachment = { id: string; filename: string; storedPath: string; mimeType: string; size: number; createdAt: string };
type Reward = {
  id: string;
  taskId: string;
  rewardText: string | null;
  points: number;
  method: string;
  status: string;
  note: string | null;
  rejectReason: string | null;
  issuedAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
  updatedAt: string;
  task: { id: string; title: string; reward: string | null; points: number };
  issuedBy: { id: string; name: string | null; email: string } | null;
  receipts: Attachment[];
};

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  PENDING:      { label: '待发放', cls: 'bg-amber-50 text-amber-800 ring-amber-200',     dot: 'bg-amber-500' },
  ISSUED:       { label: '已发放待确认', cls: 'bg-sky-50 text-sky-700 ring-sky-200',      dot: 'bg-sky-500' },
  ACKNOWLEDGED: { label: '已确认', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  DISPUTED:     { label: '有异议', cls: 'bg-rose-50 text-rose-700 ring-rose-200',         dot: 'bg-rose-500' },
  CANCELLED:    { label: '已取消', cls: 'bg-slate-100 text-slate-500 ring-slate-200',     dot: 'bg-slate-400' },
};

const METHOD_LABEL: Record<string, string> = {
  CASH: '现金', TRANSFER: '转账', VOUCHER: '代金券', IN_KIND: '实物', POINTS_ONLY: '仅积分', OTHER: '其他',
};

function fmt(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : '';
}

export default function MyRewardsClient({ initial }: { initial: Reward[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Reward[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, status: 'ACKNOWLEDGED' | 'DISPUTED', noteInput?: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/rewards/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note: noteInput ?? null }),
      });
      if (!res.ok) { alert((await res.json()).error ?? '操作失败'); return; }
      const updated = await res.json();
      setItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function ack(id: string) { await act(id, 'ACKNOWLEDGED'); }
  async function dispute(id: string) {
    const reason = prompt('请简单说明问题（比如金额不对 / 没收到 / 内容不符）：');
    if (!reason || !reason.trim()) return;
    await act(id, 'DISPUTED', reason.trim());
  }

  if (items.length === 0) {
    return (
      <div className="card rise rise-delay-2 py-14 text-center text-sm text-slate-500">
        还没有奖励记录。完成任务并通过审核后，这里会自动出现 🎁
      </div>
    );
  }

  return (
    <ul className="space-y-3 rise rise-delay-2">
      {items.map((r) => {
        const meta = STATUS_META[r.status] ?? STATUS_META.PENDING;
        return (
          <li key={r.id} className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ${meta.cls}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </span>
                  <span className="text-xs text-slate-500">创建于 {fmt(r.createdAt)}</span>
                </div>
                <Link href={`/tasks/${r.task.id}`} className="line-clamp-1 block text-base font-medium text-slate-800 underline-offset-2 hover:underline">
                  {r.task.title}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-600">
                  {r.rewardText && <span>🎁 <strong>{r.rewardText}</strong></span>}
                  {r.points > 0 && <span>{r.points} 积分</span>}
                  <span className="text-xs text-slate-500">· {METHOD_LABEL[r.method] ?? r.method}</span>
                </div>
                {r.issuedAt && (
                  <div className="mt-1 text-xs text-slate-500">
                    {r.issuedBy?.name ?? r.issuedBy?.email ?? '管理员'} 于 {fmt(r.issuedAt)} 标记已发放
                  </div>
                )}
                {r.acknowledgedAt && (
                  <div className="mt-0.5 text-xs text-emerald-700">你已于 {fmt(r.acknowledgedAt)} 确认收到</div>
                )}
                {r.rejectReason && (r.status === 'CANCELLED' || r.status === 'DISPUTED') && (
                  <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
                    <span className="font-medium">驳回理由：</span>
                    <span className="whitespace-pre-wrap">{r.rejectReason}</span>
                  </div>
                )}
                {r.note && (
                  <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-100">
                    <span className="font-medium text-slate-700">备注：</span>{r.note}
                  </div>
                )}
                {r.receipts.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {r.receipts.map((a) => (
                      <li key={a.id}>
                        <a href={`/api/attachments/${a.id}`} target="_blank" className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 10-5.656-5.656L5.757 10.586a6 6 0 108.485 8.485L20 13.828" /></svg>
                          {a.filename}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {r.status === 'ISSUED' && (
                <div className="flex w-full flex-col gap-2 sm:w-auto">
                  <button
                    onClick={() => ack(r.id)}
                    disabled={busyId === r.id}
                    className="btn btn-primary w-full sm:w-auto"
                  >
                    {busyId === r.id ? '处理中…' : '✓ 已收到'}
                  </button>
                  <button
                    onClick={() => dispute(r.id)}
                    disabled={busyId === r.id}
                    className="text-xs text-rose-600 hover:underline"
                  >
                    有异议？
                  </button>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
