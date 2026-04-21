'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

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
type Role = 'SUPER_ADMIN' | 'ADMIN' | 'MEMBER';

type RosterUser = { id: string; name: string | null; email: string; image: string | null; role: string; readAt?: string | null };
type Roster = { read: RosterUser[]; unread: RosterUser[]; totalActive: number };

function fmt(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}

function initialOf(s: string | null | undefined) {
  return (s || '?').slice(0, 1).toUpperCase();
}

export default function AnnouncementsClient({
  initial,
  meId,
  meRole,
  totalActive,
}: {
  initial: Announcement[];
  meId: string;
  meRole: Role;
  totalActive: number;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Announcement[]>(initial);

  async function markRead(id: string) {
    const res = await fetch(`/api/announcements/${id}/read`, { method: 'POST' });
    if (!res.ok) return;
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, readByMe: true, readAtByMe: new Date().toISOString(), readingsCount: a.readingsCount + 1 } : a)));
    window.dispatchEvent(new CustomEvent('badges:refresh'));
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm('⚠️ 确认删除这条公告？已读记录会一并删除，不可恢复。')) return;
    const res = await fetch(`/api/announcements/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? '删除失败');
      return;
    }
    setItems((prev) => prev.filter((a) => a.id !== id));
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
        const isExpired = a.expiresAt ? new Date(a.expiresAt).getTime() < Date.now() : false;
        const isSuper = meRole === 'SUPER_ADMIN';
        const isAuthor = a.createdBy.id === meId;
        const canDelete = isSuper || isAuthor;
        const canSeeRoster = isSuper || isAuthor;
        return (
          <AnnouncementCard
            key={a.id}
            a={a}
            isExpired={isExpired}
            canDelete={canDelete}
            canSeeRoster={canSeeRoster}
            totalActive={totalActive}
            onMarkRead={() => markRead(a.id)}
            onRemove={() => remove(a.id)}
          />
        );
      })}
    </ul>
  );
}

function AnnouncementCard({
  a,
  isExpired,
  canDelete,
  canSeeRoster,
  totalActive,
  onMarkRead,
  onRemove,
}: {
  a: Announcement;
  isExpired: boolean;
  canDelete: boolean;
  canSeeRoster: boolean;
  totalActive: number;
  onMarkRead: () => void;
  onRemove: () => void;
}) {
  const readPct = totalActive > 0 ? Math.round((a.readingsCount / totalActive) * 100) : 0;
  const [rosterOpen, setRosterOpen] = useState(false);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterErr, setRosterErr] = useState<string | null>(null);

  async function loadRoster() {
    setRosterLoading(true);
    setRosterErr(null);
    try {
      const res = await fetch(`/api/announcements/${a.id}/readings`, { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `加载失败 (HTTP ${res.status})`);
      }
      setRoster(await res.json());
    } catch (e: any) {
      setRosterErr(e.message || '加载失败');
    } finally {
      setRosterLoading(false);
    }
  }

  useEffect(() => {
    if (rosterOpen && !roster && !rosterLoading) loadRoster();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterOpen]);

  return (
    <li className={`card overflow-hidden ${a.pinned ? 'ring-2 ring-amber-300' : ''} ${!a.readByMe && !isExpired ? 'ring-1 ring-indigo-200' : ''} ${isExpired ? 'opacity-70' : ''}`}>
      {a.pinned && <div className="accent-bar h-1" />}
      <div className="p-5 sm:p-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {a.pinned && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 ring-1 ring-amber-300">📌 置顶</span>}
          {isExpired && <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">🕓 已过期</span>}
          {!a.readByMe && !isExpired && <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700 ring-1 ring-indigo-200">未读</span>}
          <span className="text-xs text-slate-500">
            {a.createdBy.name ?? a.createdBy.email} · {fmt(a.publishedAt)}
          </span>
          {a.expiresAt && !isExpired && (
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
            已知悉 <span className="font-semibold text-slate-700">{a.readingsCount} / {totalActive}</span>
            {totalActive > 0 && <span className="ml-1 text-slate-400">· {readPct}%</span>}
          </span>
          {a.readByMe ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-emerald-700 ring-1 ring-emerald-200">
              ✓ 已知悉 {a.readAtByMe && `· ${fmt(a.readAtByMe)}`}
            </span>
          ) : (
            <button
              onClick={onMarkRead}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700"
            >
              ✓ 我已知悉
            </button>
          )}
        </div>

        {(canSeeRoster || canDelete) && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-dashed border-slate-200 pt-4">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              发布者 / 总管理者操作
            </span>
            <span className="mx-1 h-4 w-px bg-slate-200" />
            {canSeeRoster && (
              <button
                onClick={() => setRosterOpen((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {rosterOpen ? '▲ 收起名单' : `👥 查看谁看了 / 谁没看 (${a.readingsCount} 已 / ${totalActive - a.readingsCount} 未)`}
              </button>
            )}
            {canDelete && (
              <button
                onClick={onRemove}
                className="ml-auto inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-600 hover:text-white"
              >
                🗑 删除公告
              </button>
            )}
          </div>
        )}

        {rosterOpen && canSeeRoster && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            {rosterLoading && <div className="text-center text-sm text-slate-500">加载中…</div>}
            {rosterErr && <div className="text-sm text-rose-600">⚠️ {rosterErr}</div>}
            {roster && (
              <>
                <div className="mb-3 text-xs text-slate-600">
                  共 {roster.totalActive} 人 · <span className="font-semibold text-emerald-700">已知悉 {roster.read.length}</span> · <span className="font-semibold text-rose-700">未知悉 {roster.unread.length}</span>
                </div>

                <section className="mb-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-rose-700">
                    ❗ 未知悉 <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px]">{roster.unread.length}</span>
                  </div>
                  {roster.unread.length === 0 ? (
                    <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
                      🎉 全员都已确认此条公告
                    </div>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {roster.unread.map((u) => (
                        <li key={u.id} className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2 py-1 text-xs text-rose-900 ring-1 ring-rose-200">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-rose-300 to-red-400 text-[10px] font-semibold text-white">
                            {initialOf(u.name ?? u.email)}
                          </span>
                          {u.name ?? u.email}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-700">
                    ✓ 已知悉 <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px]">{roster.read.length}</span>
                  </div>
                  {roster.read.length === 0 ? (
                    <div className="text-sm text-slate-500">还没有人点"我已知悉"</div>
                  ) : (
                    <ul className="divide-y divide-slate-100 rounded-lg bg-white ring-1 ring-slate-200">
                      {roster.read.map((u) => (
                        <li key={u.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-emerald-300 to-teal-400 text-[11px] font-semibold text-white">
                            {initialOf(u.name ?? u.email)}
                          </span>
                          <span className="flex-1 truncate">{u.name ?? u.email}</span>
                          {u.readAt && <span className="text-xs text-slate-400">{fmt(u.readAt)}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
