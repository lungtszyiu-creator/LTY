'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Attachment = { id: string; filename: string; mimeType: string; size: number; createdAt: string };
type Announcement = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  publishedAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string | null; email: string };
  attachments: Attachment[];
  readByMe: boolean;
  readAtByMe: string | null;
  readingsCount: number;
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AnnouncementsClient({
  initial,
  meId,
  totalActive,
}: {
  initial: Announcement[];
  meId: string;
  totalActive: number;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Announcement[]>(initial);

  async function markRead(id: string) {
    const res = await fetch(`/api/announcements/${id}/read`, { method: 'POST' });
    if (!res.ok) return;
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, readByMe: true, readAtByMe: new Date().toISOString(), readingsCount: a.readingsCount + 1 } : a)));
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <div className="card rise rise-delay-1 py-14 text-center text-sm text-slate-500">
        暂时没有公告。老板忙着打磨产品，没空发话 🏋️
      </div>
    );
  }

  return (
    <ul className="space-y-4 rise rise-delay-1">
      {items.map((a) => {
        const readPct = totalActive > 0 ? Math.round((a.readingsCount / totalActive) * 100) : 0;
        return (
          <li key={a.id} className={`card overflow-hidden ${a.pinned ? 'ring-2 ring-amber-300' : ''} ${!a.readByMe ? 'ring-1 ring-indigo-200' : ''}`}>
            {a.pinned && (
              <div className="accent-bar h-1" />
            )}
            <div className="p-5 sm:p-6">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {a.pinned && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 ring-1 ring-amber-300">📌 置顶</span>}
                {!a.readByMe && <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700 ring-1 ring-indigo-200">未读</span>}
                <span className="text-xs text-slate-500">
                  {a.createdBy.name ?? a.createdBy.email} · {fmt(a.publishedAt)}
                </span>
                {a.expiresAt && (
                  <span className="text-xs text-slate-400">有效期至 {fmt(a.expiresAt)}</span>
                )}
              </div>
              <h2 className="mb-3 text-lg font-semibold tracking-tight sm:text-xl">{a.title}</h2>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {a.body}
              </div>

              {a.attachments.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {a.attachments.map((att) => (
                    <li key={att.id}>
                      <a href={`/api/attachments/${att.id}`} target="_blank" className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-200">
                        📎 {att.filename}
                      </a>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
                <span>
                  已读 {a.readingsCount} / {totalActive}
                  {totalActive > 0 && <span className="ml-1">· {readPct}%</span>}
                </span>
                {a.readByMe ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-emerald-700 ring-1 ring-emerald-200">
                    ✓ 已读 {a.readAtByMe && `· ${fmt(a.readAtByMe)}`}
                  </span>
                ) : (
                  <button onClick={() => markRead(a.id)} className="btn btn-ghost text-xs">
                    标记已读
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
