'use client';

import Link from 'next/link';
import { useState } from 'react';

type Log = {
  id: string;
  kind: string;
  taskId: string | null;
  subject: string;
  recipients: number;
  status: string;
  attempts: number;
  error: string | null;
  createdAt: string;
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  SENT: { label: '已发送', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  FAILED: { label: '失败', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  NOT_CONFIGURED: { label: '未配置', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
};

const KIND_META: Record<string, string> = {
  TASK_PUBLISHED: '任务发布',
  SUBMISSION: '提交待审',
};

export default function NotificationsList({ initial }: { initial: Log[] }) {
  const [logs, setLogs] = useState<Log[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  async function resend(log: Log) {
    if (!log.taskId) { setToast({ kind: 'err', msg: '该记录没有关联任务，无法重发' }); return; }
    setBusyId(log.id);
    try {
      const res = await fetch('/api/notifications/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: log.taskId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setToast({ kind: 'err', msg: `重发失败：${body.error ?? res.statusText}` });
      } else {
        setToast({ kind: 'ok', msg: `已重发（尝试 ${body.attempts} 次）` });
        // refresh list
        const r = await fetch('/api/notifications?limit=100');
        if (r.ok) {
          const list = await r.json();
          setLogs(list);
        }
      }
    } catch (e: any) {
      setToast({ kind: 'err', msg: e?.message ?? '未知错误' });
    } finally {
      setBusyId(null);
      setTimeout(() => setToast(null), 4000);
    }
  }

  return (
    <>
      {toast && (
        <div className={`mb-4 rounded-xl px-4 py-2.5 text-sm ${toast.kind === 'ok' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'}`}>
          {toast.msg}
        </div>
      )}
      <div className="card rise overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3 text-left font-medium">时间</th>
              <th className="px-5 py-3 text-left font-medium">类型</th>
              <th className="px-5 py-3 text-left font-medium">主题</th>
              <th className="px-5 py-3 text-left font-medium">收件人</th>
              <th className="px-5 py-3 text-left font-medium">状态</th>
              <th className="px-5 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((l) => {
              const meta = STATUS_META[l.status] ?? STATUS_META.FAILED;
              return (
                <tr key={l.id} className="transition hover:bg-slate-50/60">
                  <td className="px-5 py-3 text-slate-600">{new Date(l.createdAt).toLocaleString('zh-CN')}</td>
                  <td className="px-5 py-3">{KIND_META[l.kind] ?? l.kind}</td>
                  <td className="max-w-xs px-5 py-3">
                    {l.taskId ? (
                      <Link href={`/tasks/${l.taskId}`} className="truncate text-slate-800 underline-offset-2 hover:underline">
                        {l.subject}
                      </Link>
                    ) : (
                      <span className="truncate text-slate-700">{l.subject}</span>
                    )}
                    {l.error && <div className="mt-0.5 truncate text-xs text-rose-600">{l.error}</div>}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{l.recipients}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs ring-1 ${meta.cls}`}>
                      {meta.label} {l.attempts > 1 && `· ${l.attempts} 次`}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {l.kind === 'TASK_PUBLISHED' && l.taskId && l.status !== 'SENT' && (
                      <button
                        onClick={() => resend(l)}
                        disabled={busyId === l.id}
                        className="text-xs text-amber-800 hover:text-amber-900 disabled:opacity-50"
                      >
                        {busyId === l.id ? '重发中…' : '重发通知'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-sm text-slate-500">暂无通知记录</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
