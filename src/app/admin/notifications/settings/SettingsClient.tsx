'use client';

import { useState } from 'react';

type UserOpt = { id: string; name: string | null; email: string };
type Item = {
  kind: string;
  label: string;
  defaultAudience: string;
  enabled: boolean;
  extraUserIds: string[];
};

export default function SettingsClient({ initial, users }: { initial: Item[]; users: UserOpt[] }) {
  const [items, setItems] = useState<Item[]>(initial);
  const [savingKind, setSavingKind] = useState<string | null>(null);

  async function patch(kind: string, data: { enabled?: boolean; extraUserIds?: string[] }) {
    setSavingKind(kind);
    try {
      const res = await fetch('/api/notifications/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, ...data }),
      });
      if (!res.ok) { alert('保存失败'); return; }
      setItems((prev) => prev.map((x) => (x.kind === kind ? { ...x, ...data, extraUserIds: data.extraUserIds ?? x.extraUserIds } : x)));
    } finally {
      setSavingKind(null);
    }
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.kind} className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-base font-semibold">{item.label}</div>
              <div className="mt-0.5 text-xs text-slate-500">
                默认发给：<span className="text-slate-700">{item.defaultAudience}</span>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={item.enabled}
                onChange={(e) => patch(item.kind, { enabled: e.target.checked })}
                disabled={savingKind === item.kind}
              />
              {item.enabled ? '✓ 启用' : '⏸ 已关闭'}
            </label>
          </div>

          <div className="mt-3">
            <div className="mb-1 text-xs font-medium text-slate-500">追加通知（在默认收件人基础上 cc 给这些人）</div>
            <MemberPicker
              users={users}
              selected={item.extraUserIds}
              onChange={(ids) => patch(item.kind, { extraUserIds: ids })}
            />
            {item.extraUserIds.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {item.extraUserIds.map((id) => {
                  const u = users.find((x) => x.id === id);
                  if (!u) return null;
                  return (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700 ring-1 ring-indigo-200">
                      + {u.name ?? u.email}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function MemberPicker({
  users,
  selected,
  onChange,
}: {
  users: UserOpt[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
      >
        {open ? '关闭选择' : `选择成员（${selected.length}）`}
      </button>
      {open && (
        <div className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow">
          <ul className="space-y-0.5">
            {users.map((u) => (
              <li key={u.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-slate-50">
                  <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} />
                  <span>{u.name ?? u.email}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
