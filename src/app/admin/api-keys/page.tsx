'use client';

/**
 * 通用 API Key 管理（仅 Admin 可见）—— 给所有部门 AI 员工发钥匙
 *
 * 跟 /admin/finance/api-keys 共用同一个后端（/api/finance/api-keys），后端 schema
 * 接受任意 scope 字符串。本页扩展前端 SCOPE_PRESETS 加入行政 / 法务（双） /
 * HR / 知识管理 / MC 法务 等预设，按部门 optgroup 分组。
 *
 * 流程：
 * - 选 scope（"行政部 · 证照管家"等）
 * - 输入 key 名（自动建议）
 * - 点 "生成 Key" → 弹出明文 Key（一次性）
 * - 复制后给 Coze plugin x-api-key header / n8n HTTP 节点
 *
 * 命名约定：
 * - <DEPT>_AI:<role>  —— 单一角色 narrow scope（例 ADMIN_AI:license_clerk）
 * - <DEPT>_ADMIN     —— 部门全权（慎发，发了等于把整部门给 AI 写）
 * - <DEPT>_READONLY  —— 部门只读（被动看板用）
 */
import { useEffect, useState } from 'react';

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

type ScopePreset = {
  group: string;
  value: string;
  label: string;
  desc: string;
  danger?: boolean;
};

const SCOPE_PRESETS: ScopePreset[] = [
  // ====== 财务部（既有，5 个 AI 员工 + 老板 + 只读）======
  { group: '💰 财务部', value: 'FINANCE_AI:voucher_clerk', label: '凭证编制员', desc: '只能写凭证草稿' },
  { group: '💰 财务部', value: 'FINANCE_AI:chain_bookkeeper', label: '链上记账员', desc: '只能写链上交易' },
  { group: '💰 财务部', value: 'FINANCE_AI:forex_lookout', label: '汇率瞭望员', desc: '只能写汇率' },
  { group: '💰 财务部', value: 'FINANCE_AI:reconciler', label: '对账员', desc: '读链上 + 银行 + 写对账' },
  { group: '💰 财务部', value: 'FINANCE_AI:cfo', label: 'CFO 财务总监', desc: '全财务读 + 多数写' },
  { group: '💰 财务部', value: 'FINANCE_ADMIN', label: '👑 财务全权', desc: '全财务读写（慎发）', danger: true },
  { group: '💰 财务部', value: 'FINANCE_READONLY', label: '财务只读', desc: '看板被动展示用' },

  // ====== 行政部（PR A 嵌入）======
  { group: '🏢 行政部', value: 'ADMIN_AI:license_clerk', label: '证照管家', desc: '写证照 + 到期监控' },
  { group: '🏢 行政部', value: 'ADMIN_AI:asset_clerk', label: '资产管家', desc: '写固定资产 + 状态' },
  { group: '🏢 行政部', value: 'ADMIN_AI:facility_clerk', label: '设施管家（v1.1）', desc: '会议室预定 + IT 工单' },
  { group: '🏢 行政部', value: 'ADMIN_ADMIN', label: '👑 行政全权', desc: '行政部全读写（慎发）', danger: true },
  { group: '🏢 行政部', value: 'ADMIN_READONLY', label: '行政只读', desc: '看板被动展示用' },

  // ====== LTY 法务部（PR D 嵌入，自家业务）======
  { group: '⚖️ LTY 法务部', value: 'LTY_LEGAL_AI:legal_clerk', label: 'LTY 法务工单', desc: '写 LtyLegalRequest' },
  { group: '⚖️ LTY 法务部', value: 'LTY_LEGAL_AI:assistant', label: 'LTY 法务助手（v1.1）', desc: 'AI 问答 + 服务目录' },
  { group: '⚖️ LTY 法务部', value: 'LTY_LEGAL_ADMIN', label: '👑 LTY 法务全权', desc: 'LTY 法务全读写（慎发）', danger: true },
  { group: '⚖️ LTY 法务部', value: 'LTY_LEGAL_READONLY', label: 'LTY 法务只读', desc: '看板被动展示用' },

  // ====== MC 法务部（PR D 嵌入，物理隔离）======
  { group: '🔒 MC 法务部（隔离）', value: 'MC_LEGAL_AI:legal_clerk', label: 'MC 法务工单', desc: '写 McLegalRequest（与 LTY 隔离）' },
  { group: '🔒 MC 法务部（隔离）', value: 'MC_LEGAL_AI:assistant', label: 'MC 法务助手（v1.1）', desc: '独立 MC Coze workspace' },
  { group: '🔒 MC 法务部（隔离）', value: 'MC_LEGAL_ADMIN', label: '👑 MC 法务全权', desc: 'MC 法务全读写（慎发，红线）', danger: true },
  { group: '🔒 MC 法务部（隔离）', value: 'MC_LEGAL_READONLY', label: 'MC 法务只读', desc: '看板被动展示用' },

  // ====== 人事部（PR E 嵌入）======
  { group: '👥 人事部', value: 'HR_AI:hr_clerk', label: '人事管家', desc: '写候选人 / 员工档案 / 试用期监控' },
  { group: '👥 人事部', value: 'HR_ADMIN', label: '👑 人事全权', desc: '人事部全读写（慎发）', danger: true },
  { group: '👥 人事部', value: 'HR_READONLY', label: '人事只读', desc: '看板被动展示用' },

  // ====== 财务出纳（PR E 嵌入）======
  { group: '💼 财务出纳', value: 'CASHIER_AI:cashier_clerk', label: '出纳助手', desc: '快速录入 / 报销 / 对账（v1.1 接入后可写）' },
  { group: '💼 财务出纳', value: 'CASHIER_ADMIN', label: '👑 出纳全权', desc: '出纳全读写（慎发）', danger: true },
  { group: '💼 财务出纳', value: 'CASHIER_READONLY', label: '出纳只读', desc: '看板被动展示用' },
  { group: '📚 知识管理部', value: 'KNOWLEDGE_AI:curator', label: '维基管家', desc: 'ingest / 写 wiki' },
  { group: '📚 知识管理部', value: 'KNOWLEDGE_AI:scribe', label: '仓库员', desc: 'raw 归档' },
  { group: '📚 知识管理部', value: 'KNOWLEDGE_AI:inspector', label: '审查员', desc: '断链 / 孤儿页扫描' },
];

export default function ApiKeyAdminPage() {
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
    } catch (e: any) {
      setError(e.message);
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
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">API Key 管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          给每个部门的 AI 员工发钥匙 —— 财务 / 行政 / 法务（双） / HR / 知识管理 共用一份管理面板。
          这把钥匙是 AI 调你看板 API 的凭证 —— 写在 Coze Plugin / n8n 里，
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
