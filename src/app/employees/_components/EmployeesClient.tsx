'use client';

/**
 * AI 员工档案 client UI — Step 1
 *
 * 桌面：表格（姓名/角色/部门/层级/日额度/状态/最近活跃/操作）
 * 移动：卡片堆，每张卡片含同样信息 + 操作按钮
 *
 * 操作：
 *   - ✏️ 编辑（弹模态框）
 *   - 🔌 停用 / 启用（toggle active）
 *   - 🗑 删除（仅 SUPER_ADMIN）
 *
 * Step 1 不含 isSupervisor / reportsToId 操作（schema 已放，Step 4 暴露 UI）。
 *
 * 实时状态：
 *   running  < 5 min   绿
 *   idle     < 30 min  黄
 *   offline  其他      灰
 *   never    无 lastActiveAt 灰
 */
import { useEffect, useState, useTransition } from 'react';

export type EmployeeRow = {
  id: string;
  name: string;
  role: string;
  deptSlug: string | null;
  layer: number;
  active: boolean;
  dailyLimitHkd: number;
  paused: boolean;
  pausedAt: string | null;
  pauseReason: string | null;
  webhookUrl: string | null;
  lastActiveAt: string | null;
  isSupervisor: boolean;
  reportsToId: string | null;
  apiKey: {
    id: string;
    keyPrefix: string;
    scope: string;
    active: boolean;
    revokedAt: string | null;
    lastUsedAt: string | null;
  } | null;
  createdAt: string;
};

type DeptOption = { slug: string; name: string };

const LAYER_LABEL: Record<number, string> = {
  1: '总监',
  2: '组长',
  3: '一线',
  4: '助理',
  5: '实习',
};

type LiveStatus = 'running' | 'idle' | 'offline' | 'never';
function computeLive(active: boolean, lastActiveAt: string | null): LiveStatus {
  if (!active) return 'offline';
  if (!lastActiveAt) return 'never';
  const ms = Date.now() - new Date(lastActiveAt).getTime();
  if (ms < 5 * 60_000) return 'running';
  if (ms < 30 * 60_000) return 'idle';
  return 'offline';
}

export function EmployeesClient({
  initial,
  depts,
  meRole,
}: {
  initial: EmployeeRow[];
  depts: DeptOption[];
  meRole: 'ADMIN' | 'SUPER_ADMIN';
}) {
  const [rows, setRows] = useState<EmployeeRow[]>(initial);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<EmployeeRow | null>(null);
  const [newKeyForCopy, setNewKeyForCopy] = useState<{ name: string; key: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 每分钟刷一次 lastActiveAt 的状态指示（不重 fetch，仅 re-render）
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  async function refresh() {
    try {
      const r = await fetch('/api/employees', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        setRows(j.employees ?? []);
      }
    } catch {
      /* nav data fail 不阻塞 */
    }
  }

  function toggleActive(row: EmployeeRow) {
    setError(null);
    startTransition(async () => {
      const r = await fetch(`/api/employees/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !row.active }),
      });
      if (r.ok) await refresh();
      else setError(`停用/启用失败：${(await r.json().catch(() => ({}))).error ?? r.statusText}`);
    });
  }

  function onDelete(row: EmployeeRow) {
    if (!confirm(`确定硬删 "${row.name}"？同时吊销绑定的 API Key（不可恢复）。`)) return;
    setError(null);
    startTransition(async () => {
      const r = await fetch(`/api/employees/${row.id}`, { method: 'DELETE' });
      if (r.ok) await refresh();
      else setError(`删除失败：${(await r.json().catch(() => ({}))).error ?? r.statusText}`);
    });
  }

  return (
    <>
      {error && (
        <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </div>
      )}

      {/* 工具条 */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">
          共 {rows.length} 个 AI 员工 · 在用 {rows.filter((r) => r.active).length}
        </span>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-rose-700 px-3 py-1.5 text-sm font-medium text-amber-50 transition hover:bg-rose-800"
        >
          ＋ 新建 AI 员工
        </button>
      </div>

      {/* 桌面表格 */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left">姓名</th>
              <th className="px-4 py-2 text-left">角色</th>
              <th className="px-4 py-2 text-left">部门</th>
              <th className="px-4 py-2 text-left">层级</th>
              <th className="px-4 py-2 text-right">日额度 HKD</th>
              <th className="px-4 py-2 text-left">状态</th>
              <th className="px-4 py-2 text-left">API Key</th>
              <th className="px-4 py-2 text-left">最近活跃</th>
              <th className="px-4 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-sm text-slate-400">
                  还没有 AI 员工。点上面 ＋ 按钮新建第一个。
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const dept = depts.find((d) => d.slug === row.deptSlug);
              return (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 align-top">
                    <div className="flex items-center gap-2">
                      <LiveDot status={computeLive(row.active, row.lastActiveAt)} />
                      <span className="font-medium text-slate-800">{row.name}</span>
                      {row.isSupervisor && (
                        <span className="rounded-full bg-amber-100/70 px-1.5 py-0.5 text-[10px] text-amber-800 ring-1 ring-amber-200/70">
                          👑 上司
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 align-top text-slate-700">{row.role}</td>
                  <td className="px-4 py-2 align-top text-xs text-slate-600">
                    {dept?.name ?? <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-2 align-top text-xs text-slate-600">
                    {LAYER_LABEL[row.layer] ?? `L${row.layer}`}
                  </td>
                  <td className="px-4 py-2 align-top text-right font-mono tabular-nums text-slate-700">
                    {row.dailyLimitHkd.toLocaleString('zh-HK', { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-2 align-top whitespace-nowrap">
                    <StatusChip active={row.active} paused={row.paused} />
                  </td>
                  <td className="px-4 py-2 align-top">
                    {row.apiKey ? (
                      <span className="font-mono text-[11px] text-slate-500">
                        {row.apiKey.keyPrefix}…
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">无</span>
                    )}
                  </td>
                  <td className="px-4 py-2 align-top text-xs text-slate-500">
                    {row.lastActiveAt ? formatTimeAgo(row.lastActiveAt) : '从未'}
                  </td>
                  <td className="px-4 py-2 align-top text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditTarget(row)}
                        className="text-xs text-sky-700 hover:underline"
                      >
                        ✏️ 编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(row)}
                        disabled={pending}
                        className="text-xs text-slate-600 hover:underline disabled:opacity-50"
                      >
                        🔌 {row.active ? '停用' : '启用'}
                      </button>
                      {meRole === 'SUPER_ADMIN' && (
                        <button
                          type="button"
                          onClick={() => onDelete(row)}
                          disabled={pending}
                          className="text-xs text-rose-600 hover:underline disabled:opacity-50"
                        >
                          🗑 删除
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 移动卡片 */}
      <ul className="space-y-2 md:hidden">
        {rows.length === 0 && (
          <li className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-4 py-6 text-center text-sm text-slate-400">
            还没有 AI 员工。点 ＋ 按钮新建。
          </li>
        )}
        {rows.map((row) => {
          const dept = depts.find((d) => d.slug === row.deptSlug);
          return (
            <li key={row.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <LiveDot status={computeLive(row.active, row.lastActiveAt)} />
                    <span className="truncate font-semibold text-slate-800">{row.name}</span>
                    {row.isSupervisor && (
                      <span className="rounded-full bg-amber-100/70 px-1.5 py-0.5 text-[10px] text-amber-800 ring-1 ring-amber-200/70">
                        👑
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-slate-500">
                    {row.role} · {dept?.name ?? '—'} · {LAYER_LABEL[row.layer] ?? `L${row.layer}`}
                  </div>
                </div>
                <StatusChip active={row.active} paused={row.paused} />
              </div>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-slate-500">
                <span>
                  日额度{' '}
                  <span className="font-mono text-slate-700 tabular-nums">
                    HKD {row.dailyLimitHkd.toLocaleString('zh-HK')}
                  </span>
                </span>
                {row.apiKey && (
                  <span className="font-mono text-slate-400">{row.apiKey.keyPrefix}…</span>
                )}
                <span>
                  {row.lastActiveAt ? `活跃 ${formatTimeAgo(row.lastActiveAt)}` : '从未活跃'}
                </span>
              </div>
              <div className="mt-2 flex gap-2 border-t border-slate-100 pt-2">
                <button
                  type="button"
                  onClick={() => setEditTarget(row)}
                  className="flex-1 rounded-md bg-sky-50 px-2 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100"
                >
                  ✏️ 编辑
                </button>
                <button
                  type="button"
                  onClick={() => toggleActive(row)}
                  disabled={pending}
                  className="flex-1 rounded-md bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  🔌 {row.active ? '停用' : '启用'}
                </button>
                {meRole === 'SUPER_ADMIN' && (
                  <button
                    type="button"
                    onClick={() => onDelete(row)}
                    disabled={pending}
                    className="flex-1 rounded-md bg-rose-50 px-2 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100 disabled:opacity-50"
                  >
                    🗑
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* 新建模态框 */}
      {showCreate && (
        <CreateDialog
          depts={depts}
          onClose={() => setShowCreate(false)}
          onCreated={async (plaintext, employee) => {
            setShowCreate(false);
            await refresh();
            if (plaintext) {
              setNewKeyForCopy({ name: employee.name, key: plaintext });
            }
          }}
        />
      )}

      {/* 编辑模态框 */}
      {editTarget && (
        <EditDialog
          row={editTarget}
          depts={depts}
          onClose={() => setEditTarget(null)}
          onSaved={async () => {
            setEditTarget(null);
            await refresh();
          }}
        />
      )}

      {/* 新生成的明文 Key 显示弹框 —— 一次性！*/}
      {newKeyForCopy && (
        <NewKeyDialog
          name={newKeyForCopy.name}
          plaintext={newKeyForCopy.key}
          onClose={() => setNewKeyForCopy(null)}
        />
      )}
    </>
  );
}

// ============ 子组件 ============

function LiveDot({ status }: { status: LiveStatus }) {
  const map: Record<LiveStatus, { cls: string; label: string }> = {
    running: { cls: 'bg-emerald-500', label: '在跑' },
    idle: { cls: 'bg-amber-400', label: '待命' },
    offline: { cls: 'bg-slate-300', label: '离线' },
    never: { cls: 'bg-slate-200', label: '从未活跃' },
  };
  const { cls, label } = map[status];
  return (
    <span
      title={label}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls} ${status === 'running' ? 'animate-pulse' : ''}`}
    />
  );
}

function StatusChip({ active, paused }: { active: boolean; paused: boolean }) {
  if (paused) {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700 ring-1 ring-rose-200">
        ⏸ 暂停
      </span>
    );
  }
  if (!active) {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 ring-1 ring-slate-200">
        停用
      </span>
    );
  }
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700 ring-1 ring-emerald-200">
      在用
    </span>
  );
}

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return '刚刚';
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)} 分钟前`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)} 小时前`;
  if (ms < 7 * 86400_000) return `${Math.floor(ms / 86400_000)} 天前`;
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

// ============ 创建模态框 ============

function CreateDialog({
  depts,
  onClose,
  onCreated,
}: {
  depts: DeptOption[];
  onClose: () => void;
  onCreated: (plaintext: string | null, employee: { id: string; name: string }) => void | Promise<void>;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [deptSlug, setDeptSlug] = useState('');
  const [layer, setLayer] = useState(3);
  // 默认 100 HKD — 公司日预算 500 / 5 员工。老板可单条调高/调低。
  const [dailyLimitHkd, setDailyLimitHkd] = useState(100);
  const [generateKey, setGenerateKey] = useState(true);
  const [apiKeyScope, setApiKeyScope] = useState('AI_EMPLOYEE:default');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          role: role.trim(),
          deptSlug: deptSlug || null,
          layer,
          dailyLimitHkd,
          generateApiKey: generateKey,
          apiKeyScope: generateKey ? apiKeyScope : undefined,
          apiKeyName: generateKey ? `${name.trim()} - 默认` : undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error ?? `HTTP ${r.status}`);
        return;
      }
      await onCreated(j.plaintext_key ?? null, j.employee);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '未知错误');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="新建 AI 员工" onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="姓名 *">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：凭证编制员"
            className={inputCls}
            autoFocus
          />
        </Field>
        <Field label="角色描述 *">
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="例：写凭证草稿"
            className={inputCls}
          />
        </Field>
        <Field label="归属部门">
          <select
            value={deptSlug}
            onChange={(e) => setDeptSlug(e.target.value)}
            className={inputCls}
          >
            <option value="">— 跨部门 / 全公司 —</option>
            {depts.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="层级">
          <select
            value={layer}
            onChange={(e) => setLayer(Number(e.target.value))}
            className={inputCls}
          >
            <option value={1}>1 - 总监</option>
            <option value={2}>2 - 组长</option>
            <option value={3}>3 - 一线</option>
            <option value={4}>4 - 助理</option>
            <option value={5}>5 - 实习</option>
          </select>
        </Field>
        <Field label="日额度 HKD">
          <input
            type="number"
            min={1}
            value={dailyLimitHkd}
            onChange={(e) => setDailyLimitHkd(Number(e.target.value))}
            className={inputCls}
          />
        </Field>
      </div>

      <div className="mt-4 rounded-lg border border-amber-200/60 bg-amber-50/30 p-3">
        <label className="flex items-baseline gap-2 text-sm font-medium text-amber-900">
          <input
            type="checkbox"
            checked={generateKey}
            onChange={(e) => setGenerateKey(e.target.checked)}
          />
          <span>同时生成 API Key（lty_... 一次性显示）</span>
        </label>
        {generateKey && (
          <Field label="API Key Scope">
            <input
              value={apiKeyScope}
              onChange={(e) => setApiKeyScope(e.target.value)}
              placeholder="例：FINANCE_AI:voucher_clerk / AI_EMPLOYEE:default"
              className={inputCls}
            />
            <span className="mt-1 block text-[10px] text-amber-700">
              建议沿用现有 scope 体系（FINANCE_AI:voucher_clerk 等）。默认 AI_EMPLOYEE:default。
            </span>
          </Field>
        )}
      </div>

      {err && <div className="mt-3 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || !name.trim() || !role.trim()}
          className="rounded-md bg-rose-700 px-4 py-1.5 text-sm font-medium text-amber-50 hover:bg-rose-800 disabled:opacity-50"
        >
          {busy ? '创建中…' : '创建'}
        </button>
      </div>
    </Modal>
  );
}

// ============ 编辑模态框 ============

function EditDialog({
  row,
  depts,
  onClose,
  onSaved,
}: {
  row: EmployeeRow;
  depts: DeptOption[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(row.name);
  const [role, setRole] = useState(row.role);
  const [deptSlug, setDeptSlug] = useState(row.deptSlug ?? '');
  const [layer, setLayer] = useState(row.layer);
  const [dailyLimitHkd, setDailyLimitHkd] = useState(row.dailyLimitHkd);
  const [webhookUrl, setWebhookUrl] = useState(row.webhookUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/employees/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          role: role.trim(),
          deptSlug: deptSlug || null,
          layer,
          dailyLimitHkd,
          webhookUrl: webhookUrl.trim() || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error ?? `HTTP ${r.status}`);
        return;
      }
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '未知错误');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`编辑：${row.name}`} onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="姓名 *">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="角色描述 *">
          <input value={role} onChange={(e) => setRole(e.target.value)} className={inputCls} />
        </Field>
        <Field label="归属部门">
          <select
            value={deptSlug}
            onChange={(e) => setDeptSlug(e.target.value)}
            className={inputCls}
          >
            <option value="">— 跨部门 / 全公司 —</option>
            {depts.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="层级">
          <select
            value={layer}
            onChange={(e) => setLayer(Number(e.target.value))}
            className={inputCls}
          >
            <option value={1}>1 - 总监</option>
            <option value={2}>2 - 组长</option>
            <option value={3}>3 - 一线</option>
            <option value={4}>4 - 助理</option>
            <option value={5}>5 - 实习</option>
          </select>
        </Field>
        <Field label="日额度 HKD">
          <input
            type="number"
            min={1}
            value={dailyLimitHkd}
            onChange={(e) => setDailyLimitHkd(Number(e.target.value))}
            className={inputCls}
          />
        </Field>
        <Field label="Webhook URL（可选）">
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://..."
            className={inputCls}
          />
        </Field>
      </div>

      {row.apiKey && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/40 p-3 text-xs text-slate-600">
          🔑 关联 API Key：
          <span className="ml-1 font-mono text-slate-800">{row.apiKey.keyPrefix}…</span>
          <span className="ml-2">scope: <code className="rounded bg-white px-1">{row.apiKey.scope}</code></span>
          {row.apiKey.lastUsedAt && (
            <span className="ml-2 text-slate-400">最近使用 {formatTimeAgo(row.apiKey.lastUsedAt)}</span>
          )}
          <p className="mt-1 text-[10px] text-slate-500">
            想换 scope 或重生成 key？现阶段去 /admin/api-keys 直接管理（仅老板）。
          </p>
        </div>
      )}

      {err && <div className="mt-3 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || !name.trim() || !role.trim()}
          className="rounded-md bg-rose-700 px-4 py-1.5 text-sm font-medium text-amber-50 hover:bg-rose-800 disabled:opacity-50"
        >
          {busy ? '保存中…' : '保存'}
        </button>
      </div>
    </Modal>
  );
}

// ============ 新生成 Key 弹框（一次性显示） ============

function NewKeyDialog({
  name,
  plaintext,
  onClose,
}: {
  name: string;
  plaintext: string;
  onClose: () => void;
}) {
  return (
    <Modal title={`🔑 ${name} 的新 API Key（仅显示一次）`} onClose={onClose}>
      <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4">
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-900">
          ⚠️ 立刻复制 — 关闭后永远找不回
        </div>
        <div className="break-all rounded-lg bg-white p-3 font-mono text-sm text-slate-800 ring-1 ring-amber-300">
          {plaintext}
        </div>
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-amber-800">
            把这串字符填进 AI 脚本/Coze plugin 的 <code className="rounded bg-white px-1">x-api-key</code> header。
          </span>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(plaintext);
              alert('已复制');
            }}
            className="rounded bg-amber-600 px-3 py-1 font-medium text-white hover:bg-amber-700"
          >
            复制
          </button>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-slate-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          我已复制保存
        </button>
      </div>
    </Modal>
  );
}

// ============ 通用 ============

const inputCls =
  'mt-0.5 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-amber-500 focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-slate-400 hover:text-slate-700"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
