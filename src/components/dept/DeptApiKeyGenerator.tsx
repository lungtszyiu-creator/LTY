'use client';

/**
 * 部门 API Key 生成 + 列表管理（client component）
 *
 * 嵌在 DeptApiKeysCard 内，仅 canManage=true 时渲染。
 * - select scope（限本部门预设）+ 名字 + 过期 → POST /api/finance/api-keys
 * - 生成成功显示明文 key（一次性）+ 复制
 * - 已有 keys 列表 + 吊销按钮（DELETE）
 */
import { useEffect, useState, useTransition } from 'react';

export type ScopeChoice = {
  value: string;
  label: string;
  desc: string;
  danger?: boolean;
};

type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  scope: string;
  active: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export function DeptApiKeyGenerator({
  scopePrefix,
  scopeChoices,
  initialKeys,
}: {
  scopePrefix: string;
  scopeChoices: ScopeChoice[];
  initialKeys: ApiKey[];
}) {
  const [keys, setKeys] = useState<ApiKey[]>(initialKeys);
  const [name, setName] = useState('');
  const [scope, setScope] = useState(scopeChoices[0]?.value ?? '');
  const [expiresInDays, setExpiresInDays] = useState('');
  const [pending, startTransition] = useTransition();
  const [newPlaintext, setNewPlaintext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentChoice = scopeChoices.find((c) => c.value === scope);

  async function refresh() {
    try {
      const r = await fetch(`/api/finance/api-keys?scopePrefix=${encodeURIComponent(scopePrefix)}`, {
        cache: 'no-store',
      });
      if (r.ok) {
        const j = await r.json();
        setKeys(j.keys ?? []);
      }
    } catch { /* nav 拉数据失败不阻塞 UI */ }
  }
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function onCreate() {
    setError(null);
    setNewPlaintext(null);
    startTransition(async () => {
      try {
        const r = await fetch('/api/finance/api-keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim() || `${currentChoice?.label ?? scope} - ${new Date().toISOString().slice(0, 10)}`,
            scope,
            expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
          }),
        });
        const j = await r.json();
        if (!r.ok) {
          setError(j.hint ?? j.error ?? `HTTP ${r.status}`);
          return;
        }
        setNewPlaintext(j.plaintext_key);
        setName('');
        setExpiresInDays('');
        await refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '未知错误');
      }
    });
  }

  function onRevoke(id: string) {
    if (!confirm('确定吊销这把 Key？吊销后立刻无法使用，AI 调用会 401。')) return;
    startTransition(async () => {
      const r = await fetch(`/api/finance/api-keys/${id}`, { method: 'DELETE' });
      if (r.ok) await refresh();
      else {
        const j = await r.json().catch(() => ({}));
        alert(`吊销失败：${j.hint ?? j.error ?? r.statusText}`);
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* 生成表单 */}
      <div className="rounded-lg border border-slate-200 bg-white/80 p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          生成新 Key
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="text-[10px] text-slate-500">作用域</span>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:border-amber-500 focus:outline-none"
            >
              {scopeChoices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <span
              className={`mt-0.5 block text-[10px] ${currentChoice?.danger ? 'text-rose-600' : 'text-slate-400'}`}
            >
              {currentChoice?.desc}
              {currentChoice?.danger && '  ·  ⚠️ 高危'}
            </span>
          </label>
          <label className="block">
            <span className="text-[10px] text-slate-500">Key 名（可选）</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`例：${currentChoice?.label ?? ''} - Coze`}
              className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:border-amber-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] text-slate-500">过期天数（留空 = 永不过期）</span>
            <input
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value.replace(/\D/g, ''))}
              placeholder="例：90"
              className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:border-amber-500 focus:outline-none"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={onCreate}
              disabled={pending || !scope}
              className="w-full rounded-md bg-rose-700 px-3 py-1.5 text-xs font-medium text-amber-50 transition hover:bg-rose-800 disabled:opacity-50"
            >
              {pending ? '生成中…' : '🔑 生成 Key'}
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-2 rounded-md bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700 ring-1 ring-rose-200">
            {error}
          </div>
        )}
        {newPlaintext && (
          <div className="mt-3 rounded-md border-2 border-amber-400 bg-amber-50 p-2.5">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-900">
              ⚠️ 立刻复制 — 关闭后永远找不回
            </div>
            <div className="break-all rounded bg-white p-2 font-mono text-[11px] text-slate-800 ring-1 ring-amber-300">
              {newPlaintext}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px]">
              <span className="text-amber-800">
                把这串字符填进 Coze plugin 的 <code className="rounded bg-white px-1">x-api-key</code> header
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(newPlaintext);
                  alert('已复制');
                }}
                className="rounded bg-amber-600 px-2 py-0.5 font-medium text-white hover:bg-amber-700"
              >
                复制
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 现有 keys */}
      {keys.length === 0 ? (
        <p className="text-[11px] opacity-80">本部门还没生成过 Key。</p>
      ) : (
        <ul className="divide-y divide-slate-200/60 overflow-hidden rounded-lg bg-white/70">
          {keys.map((k) => (
            <li
              key={k.id}
              className="flex items-baseline justify-between gap-2 px-3 py-1.5 text-[11px]"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-800">{k.name}</div>
                <div className="font-mono text-[10px] text-slate-400">
                  {k.keyPrefix}… · {k.scope}
                </div>
              </div>
              <span className="flex shrink-0 items-center gap-1.5">
                {k.revokedAt ? (
                  <span className="inline-flex items-center whitespace-nowrap rounded-full bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700 ring-1 ring-rose-200">
                    已吊销
                  </span>
                ) : k.active ? (
                  <>
                    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700 ring-1 ring-emerald-200">
                      在用
                    </span>
                    <button
                      type="button"
                      onClick={() => onRevoke(k.id)}
                      disabled={pending}
                      className="text-[10px] text-rose-600 hover:text-rose-800 hover:underline disabled:opacity-50"
                    >
                      吊销
                    </button>
                  </>
                ) : (
                  <span className="inline-flex items-center whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                    停用
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
