'use client';

import { useState } from 'react';

type Item = {
  id: string;
  source: string;
  botKey: string;
  method: string;
  chatId: string;
  messageId: number | null;
  text: string;
  parseMode: string | null;
  status: string;
  attempts: number;
  lastError: string | null;
  context: Record<string, unknown> | null;
  lastTriedAt: string | null;
  sentAt: string | null;
  createdAt: string;
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING: { label: '待发', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  SENDING: { label: '发送中', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  SENT: { label: '已发送', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  FAILED: { label: '失败', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

export default function TelegramNotificationsList({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState<Item[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  async function resend(item: Item) {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/admin/telegram-notifications/${item.id}/resend`, {
        method: 'POST',
      });
      const j = await res.json();
      if (res.ok && j.ok) {
        setToast({ kind: 'ok', msg: `重发成功: ${item.method} → ${item.chatId}` });
        setItems((prev) =>
          prev.map((p) =>
            p.id === item.id
              ? { ...p, status: 'SENT', sentAt: new Date().toISOString(), lastError: null, attempts: p.attempts + 1 }
              : p,
          ),
        );
      } else {
        setToast({ kind: 'err', msg: j.error || `HTTP ${res.status}` });
        setItems((prev) =>
          prev.map((p) =>
            p.id === item.id
              ? { ...p, status: 'FAILED', lastError: j.error || `HTTP ${res.status}`, attempts: p.attempts + 1, lastTriedAt: new Date().toISOString() }
              : p,
          ),
        );
      }
    } catch (e) {
      setToast({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusyId(null);
      setTimeout(() => setToast(null), 4000);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center text-sm text-slate-400">
        暂无 Telegram 通知记录 — bridge 发消息 100% 成功 ✓
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {toast && (
        <div
          className={`fixed right-6 top-20 z-50 rounded-lg px-4 py-2 text-sm shadow-lg ring-1 ${
            toast.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              : 'bg-rose-50 text-rose-700 ring-rose-200'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* desktop 表格 */}
      <table className="hidden w-full text-left text-xs md:table">
        <thead className="border-b border-slate-200 text-slate-500">
          <tr>
            <th className="py-2 pr-3">时间</th>
            <th className="pr-3">状态</th>
            <th className="pr-3">bot</th>
            <th className="pr-3">method</th>
            <th className="pr-3">chat</th>
            <th className="pr-3">尝试</th>
            <th className="pr-3">text 预览</th>
            <th className="pr-3">最近错误</th>
            <th className="pr-3"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const sm = STATUS_META[it.status] ?? STATUS_META.PENDING;
            const t = new Date(it.createdAt).toLocaleString('zh-CN', { hour12: false });
            return (
              <tr key={it.id} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-3 text-slate-600">{t}</td>
                <td className="pr-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${sm.cls}`}>
                    {sm.label}
                  </span>
                </td>
                <td className="pr-3 font-mono text-slate-700">{it.botKey}</td>
                <td className="pr-3 font-mono text-slate-600">{it.method}</td>
                <td className="pr-3 font-mono text-slate-600">{it.chatId}</td>
                <td className="pr-3 text-slate-500">{it.attempts}</td>
                <td className="max-w-xs truncate pr-3 text-slate-700" title={it.text}>
                  {it.text.slice(0, 60)}
                  {it.text.length > 60 && '…'}
                </td>
                <td className="max-w-[200px] truncate pr-3 text-rose-600" title={it.lastError ?? ''}>
                  {it.lastError ? it.lastError.slice(0, 60) : '—'}
                </td>
                <td className="pr-3">
                  {it.status !== 'SENT' && (
                    <button
                      onClick={() => resend(it)}
                      disabled={busyId === it.id}
                      className="rounded-md bg-rose-600 px-2 py-1 text-[10px] text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      {busyId === it.id ? '发送中…' : '重发'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* mobile 卡片 */}
      <ul className="space-y-2 md:hidden">
        {items.map((it) => {
          const sm = STATUS_META[it.status] ?? STATUS_META.PENDING;
          const t = new Date(it.createdAt).toLocaleString('zh-CN', { hour12: false });
          return (
            <li key={it.id} className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ring-1 ${sm.cls}`}>
                  {sm.label}
                </span>
                <span className="text-slate-400">{t}</span>
              </div>
              <div className="mb-1 text-slate-700">
                <span className="font-mono">{it.botKey}</span> · {it.method} → chat {it.chatId}
              </div>
              <div className="mb-2 line-clamp-2 text-slate-600">{it.text}</div>
              {it.lastError && (
                <div className="mb-2 truncate text-rose-600" title={it.lastError}>
                  {it.lastError}
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500">已尝试 {it.attempts} 次</span>
                {it.status !== 'SENT' && (
                  <button
                    onClick={() => resend(it)}
                    disabled={busyId === it.id}
                    className="rounded-md bg-rose-600 px-2 py-1 text-[10px] text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {busyId === it.id ? '发送中…' : '重发'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
