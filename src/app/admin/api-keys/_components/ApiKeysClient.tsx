'use client';

/**
 * API Key 总管理页 client UI
 *
 * 老板（SUPER_ADMIN）专属。这页能跨部门发任意 scope（含 FINANCE_*）。
 * 部门 LEAD / 系统 ADMIN 进不来 —— 他们只能在自己部门页 DeptApiKeyGenerator
 * 发本部门 scope。这是为了避免跨部门越权（老板原话："总 api 管理有危险"）。
 */
import { useEffect, useState } from 'react';
import { SCOPE_PRESETS, type ScopePreset } from '@/lib/scope-presets';

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

export function ApiKeysClient() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState('');
  const [scope, setScope] = useState(SCOPE_PRESETS[0].value);

  // 从 URL ?preset=XXX 预选 scope（部门页 "+ 生成 Key" 链接传过来）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const preset = params.get('preset');
    if (preset && SCOPE_PRESETS.some((p) => p.value === preset)) {
      setScope(preset);
    }
  }, []);
  const [expiresInDays, setExpiresInDays] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [newKeyPlaintext, setNewKeyPlaintext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentPreset = SCOPE_PRESETS.find((p) => p.value === scope);

  async function load() {
    const r = await fetch('/api/finance/api-keys', { cache: 'no-store' });
    if (r.ok) setKeys((await r.json()).keys);
  }
  useEffect(() => {
    load();
  }, []);

  async function create() {
    setBusy(true);
    setError(null);
    setNewKeyPlaintext(null);
    try {
      const r = await fetch('/api/finance/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || `${currentPreset?.label ?? scope} - ${new Date().toISOString().slice(0, 10)}`,
          scope,
          expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'failed');
      setNewKeyPlaintext(data.plaintext_key);
      setName('');
      setExpiresInDays('');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm('确定吊销这个 Key？吊销后立刻无法使用，AI 调用会 401。')) return;
    const r = await fetch(`/api/finance/api-keys/${id}`, { method: 'DELETE' });
    if (r.ok) await load();
  }

  // 按 group 分组
  const groups: Record<string, ScopePreset[]> = {};
  for (const p of SCOPE_PRESETS) {
    if (!groups[p.group]) groups[p.group] = [];
    groups[p.group].push(p);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">API Key 管理（总管专属）</h1>
        <p className="mt-1 text-sm text-slate-500">
          ⚠️ 这页能跨部门发任意 scope（含 FINANCE_*）—— 仅老板可进。
          部门负责人/管理员请去对应部门页生成本部门 Key。
          <br />
          这把钥匙是 AI 调你看板 API 的凭证 ——
          <strong className="text-rose-600">不要发到群里、不要写进代码、不要截图发给任何人</strong>。
        </p>
      </header>

      {/* 创建表单 */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">生成新 Key</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs text-slate-500">Key 名（人类可读）</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`例：${currentPreset?.label ?? ''} - Coze`}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring focus:ring-amber-200"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">作用域（按部门 → 角色选）</span>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring focus:ring-amber-200"
            >
              {Object.entries(groups).map(([groupName, items]) => (
                <optgroup key={groupName} label={groupName}>
                  {items.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <span className={`mt-1 block text-xs ${currentPreset?.danger ? 'text-rose-600' : 'text-slate-400'}`}>
              {currentPreset?.desc}
              {currentPreset?.danger && '  ·  ⚠️ 高危 scope'}
            </span>
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">过期天数（可选，留空=永不过期）</span>
            <input
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value.replace(/\D/g, ''))}
              placeholder="例：90"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring focus:ring-amber-200"
            />
          </label>
          <div className="flex items-end">
            <button
              onClick={create}
              disabled={busy}
              className="w-full rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-amber-50 transition hover:bg-rose-800 disabled:opacity-50"
            >
              {busy ? '生成中…' : '🔑 生成 Key'}
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}
        {newKeyPlaintext && (
          <div className="mt-4 rounded-xl border-2 border-amber-400 bg-amber-50 p-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-900">
              ⚠️ 立刻复制 — 关闭后永远找不回
            </div>
            <div className="rounded-lg bg-white p-3 font-mono text-sm break-all text-slate-800 ring-1 ring-amber-300">
              {newKeyPlaintext}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-amber-800">
                把这串字符填进 Coze Plugin 的 <code className="rounded bg-white px-1">x-api-key</code> header 或 n8n HTTP 节点 header。
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(newKeyPlaintext);
                  alert('已复制');
                }}
                className="rounded bg-amber-600 px-2 py-1 font-medium text-white hover:bg-amber-700"
              >
                复制
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 现有 Key 列表 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">现有 Key（{keys.length}）</h2>
        {keys.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-sm text-slate-400">
            还没生成 Key。
          </div>
        ) : (
          // 移动端横向溢出时滚动，避免 chip 被压缩成多行（"已吊销"换行问题）
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left align-top">名称</th>
                  <th className="px-4 py-2 text-left align-top">前缀</th>
                  <th className="px-4 py-2 text-left align-top">作用域</th>
                  <th className="px-4 py-2 text-left align-top">最近使用</th>
                  <th className="px-4 py-2 text-left align-top">状态</th>
                  <th className="px-4 py-2 text-right align-top">操作</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 align-top font-medium text-slate-800">{k.name}</td>
                    <td className="px-4 py-2 align-top font-mono text-xs text-slate-500">{k.keyPrefix}…</td>
                    <td className="px-4 py-2 align-top text-xs text-slate-600 break-all">{k.scope}</td>
                    <td className="px-4 py-2 align-top text-xs text-slate-500">
                      {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString('zh-CN') : '从未'}
                    </td>
                    <td className="px-4 py-2 align-top whitespace-nowrap">
                      {k.revokedAt ? (
                        <span className="inline-flex items-center whitespace-nowrap rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700 ring-1 ring-rose-200">
                          已吊销
                        </span>
                      ) : k.active ? (
                        <span className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 ring-1 ring-emerald-200">
                          在用
                        </span>
                      ) : (
                        <span className="inline-flex items-center whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">
                          停用
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 align-top text-right">
                      {!k.revokedAt && (
                        <button
                          onClick={() => revoke(k.id)}
                          className="text-xs text-rose-600 hover:text-rose-800 hover:underline"
                        >
                          吊销
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
