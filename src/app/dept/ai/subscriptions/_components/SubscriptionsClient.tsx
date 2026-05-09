'use client';

/**
 * AI 平台月订阅 client UI
 *
 * 桌面：表格列（vendor / displayName / 月费 HKD / 用途/扣自 / 起止 / 操作）
 * 移动：卡片堆
 *
 * 操作：
 *   - ＋新建
 *   - ✏️ 编辑
 *   - 🔌 停用 / 启用（toggle active 不删，保留入账历史关联）
 *   - 🗑 软删（active=false + endedAt=now()，UI 上灰显隐藏）
 */
import { useState, useTransition } from 'react';

export type SubRow = {
  id: string;
  vendor: string;
  displayName: string;
  monthlyHkd: number;
  monthlyAmountOriginal: number | null;
  currencyOriginal: string | null;
  billingDay: number;
  purposeAccount: string;
  fundingAccount: string;
  startedAt: string;
  endedAt: string | null;
  active: boolean;
  notes: string | null;
  bookingsCount: number;
  createdByName: string | null;
  createdAt: string;
};

const VENDOR_PRESETS = [
  { value: 'COZE_CREDIT', label: 'Coze Credit (套餐)' },
  { value: 'PERPLEXITY', label: 'Perplexity' },
  { value: 'MANUS', label: 'Manus' },
  { value: 'MINIMAX', label: 'MiniMax' },
  { value: 'OPENAI_DIRECT', label: 'OpenAI 直连 (ChatGPT Team / API)' },
  { value: 'ANTHROPIC_DIRECT', label: 'Anthropic 直连 (Claude Pro / Team)' },
  { value: 'CURSOR', label: 'Cursor' },
  { value: 'OTHER', label: '其他（自定义）' },
];

const COMMON_FUNDING_ACCOUNTS = [
  'Coze 平台预付',
  'Perplexity 平台预付',
  'Manus 平台预付',
  'MiniMax 平台预付',
  'OpenAI 平台预付',
  'Anthropic 平台预付',
  '其他货币资金-USDT钱包',
  '银行存款-HSBC',
  '应付账款',
];

const PURPOSE_PRESET = '管理费用-AI 服务费';

export function SubscriptionsClient({ initial }: { initial: SubRow[] }) {
  const [rows, setRows] = useState<SubRow[]>(initial);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<SubRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function refresh() {
    try {
      const r = await fetch('/api/admin/ai-subscriptions', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        // page.tsx server-render 多查了 _count.bookings，refresh API 不带 → 保留旧 bookingsCount
        const oldMap = new Map(rows.map((x) => [x.id, x.bookingsCount]));
        const fetched: SubRow[] = (j.subscriptions ?? []).map((s: SubRow) => ({
          ...s,
          bookingsCount: oldMap.get(s.id) ?? 0,
        }));
        setRows(fetched);
      }
    } catch {
      /* 保留旧数据 */
    }
  }

  function toggleActive(row: SubRow) {
    setError(null);
    startTransition(async () => {
      const r = await fetch(`/api/admin/ai-subscriptions/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !row.active }),
      });
      if (r.ok) await refresh();
      else {
        const j = await r.json().catch(() => ({}));
        setError(`切换失败：${j.hint ?? j.error ?? r.statusText}`);
      }
    });
  }

  function softDelete(row: SubRow) {
    if (!confirm(`软删订阅「${row.displayName}」？\n\n会停用 (active=false) 并写 endedAt=今天，但保留行供入账历史查询。`)) return;
    setError(null);
    startTransition(async () => {
      const r = await fetch(`/api/admin/ai-subscriptions/${row.id}`, { method: 'DELETE' });
      if (r.ok) await refresh();
      else {
        const j = await r.json().catch(() => ({}));
        setError(`删除失败：${j.hint ?? j.error ?? r.statusText}`);
      }
    });
  }

  return (
    <>
      {error && (
        <div className="mb-3 rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-300">
          {error}
        </div>
      )}

      <div className="mb-4 flex items-baseline justify-between gap-2">
        <span className="text-xs text-slate-500">
          共 {rows.length} 条 · 启用 {rows.filter((r) => r.active).length}
        </span>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-rose-700 px-3 py-1.5 text-sm font-medium text-amber-50 transition hover:bg-rose-800"
        >
          ＋ 新建订阅
        </button>
      </div>

      {/* 桌面表格 */}
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[120px]" />{/* vendor */}
            <col />{/* 展示名 */}
            <col className="w-[110px]" />{/* 月费 */}
            <col className="w-[18%]" />{/* 用途 */}
            <col className="w-[18%]" />{/* 扣自 */}
            <col className="w-[100px]" />{/* 起 */}
            <col className="w-[140px]" />{/* 操作 */}
          </colgroup>
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">平台</th>
              <th className="px-3 py-2 text-left">订阅名称</th>
              <th className="px-3 py-2 text-right">月费 HKD</th>
              <th className="px-3 py-2 text-left">用途 (借)</th>
              <th className="px-3 py-2 text-left">扣自 (贷)</th>
              <th className="px-3 py-2 text-left">起始</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">
                  还没录入任何订阅。点上面 ＋ 按钮录第一个（如 Coze Credit 套餐 HKD 400/月）。
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-t border-slate-100 transition hover:bg-amber-50/40 ${
                  !row.active ? 'opacity-50' : ''
                }`}
              >
                <td className="truncate px-3 py-2 align-top text-xs">
                  <span className="rounded bg-violet-100 px-1.5 py-0.5 font-mono text-[10px] text-violet-800 ring-1 ring-violet-200">
                    {row.vendor}
                  </span>
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="break-words text-sm font-medium text-slate-800">
                    {row.displayName}
                  </div>
                  {row.notes && (
                    <div className="mt-0.5 truncate text-[10px] text-slate-400" title={row.notes}>
                      {row.notes}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 align-top text-right">
                  <div className="font-mono text-sm font-semibold tabular-nums text-slate-900">
                    {row.monthlyHkd.toLocaleString('zh-HK', { maximumFractionDigits: 2 })}
                  </div>
                  {row.monthlyAmountOriginal !== null && row.currencyOriginal && (
                    <div className="text-[10px] font-mono text-slate-400 tabular-nums">
                      {row.monthlyAmountOriginal.toLocaleString('zh-HK', {
                        maximumFractionDigits: 2,
                      })}{' '}
                      {row.currencyOriginal}
                    </div>
                  )}
                  <div className="text-[10px] text-slate-400">每月 {row.billingDay} 号扣</div>
                </td>
                <td className="truncate px-3 py-2 align-top text-xs text-slate-600" title={row.purposeAccount}>
                  {row.purposeAccount}
                </td>
                <td className="truncate px-3 py-2 align-top text-xs text-slate-600" title={row.fundingAccount}>
                  {row.fundingAccount}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-top text-xs text-slate-500 tabular-nums">
                  {row.startedAt.slice(0, 10)}
                  {row.endedAt && (
                    <div className="text-[10px] text-rose-700">→ {row.endedAt.slice(0, 10)}</div>
                  )}
                </td>
                <td className="px-3 py-2 align-top text-right">
                  <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditTarget(row)}
                      className="whitespace-nowrap text-xs text-sky-800 hover:underline"
                    >
                      ✏️ 编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActive(row)}
                      disabled={pending}
                      className="whitespace-nowrap text-xs text-slate-600 hover:underline disabled:opacity-50"
                    >
                      🔌 {row.active ? '停用' : '启用'}
                    </button>
                    <button
                      type="button"
                      onClick={() => softDelete(row)}
                      disabled={pending}
                      className="whitespace-nowrap text-xs text-rose-700 hover:underline disabled:opacity-50"
                    >
                      🗑 软删
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 移动卡片 */}
      <ul className="space-y-2 md:hidden">
        {rows.length === 0 && (
          <li className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-4 py-6 text-center text-sm text-slate-400">
            还没录入订阅。点 ＋ 按钮录第一个。
          </li>
        )}
        {rows.map((row) => (
          <li
            key={row.id}
            className={`rounded-xl border border-slate-200 bg-white p-3 ${
              !row.active ? 'opacity-50' : ''
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="rounded bg-violet-100 px-1.5 py-0.5 font-mono text-[10px] text-violet-800 ring-1 ring-violet-200">
                    {row.vendor}
                  </span>
                  <span className="font-medium text-slate-800">{row.displayName}</span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-slate-500">
                  用途 {row.purposeAccount} · 扣自 {row.fundingAccount}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-sm font-semibold tabular-nums text-slate-900">
                  HKD {row.monthlyHkd.toLocaleString('zh-HK', { maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-slate-400">每月 {row.billingDay} 号</div>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={() => setEditTarget(row)}
                className="rounded-md bg-sky-100 px-2 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-200"
              >
                ✏️ 编辑
              </button>
              <button
                type="button"
                onClick={() => toggleActive(row)}
                disabled={pending}
                className="rounded-md bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                🔌 {row.active ? '停用' : '启用'}
              </button>
              <button
                type="button"
                onClick={() => softDelete(row)}
                disabled={pending}
                className="rounded-md bg-rose-100 px-2 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-200 disabled:opacity-50"
              >
                🗑 软删
              </button>
            </div>
          </li>
        ))}
      </ul>

      {showCreate && (
        <SubDialog
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={async () => {
            setShowCreate(false);
            await refresh();
          }}
        />
      )}
      {editTarget && (
        <SubDialog
          mode="edit"
          row={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={async () => {
            setEditTarget(null);
            await refresh();
          }}
        />
      )}
    </>
  );
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function SubDialog({
  mode,
  row,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  row?: SubRow;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [vendor, setVendor] = useState(row?.vendor ?? 'COZE_CREDIT');
  const [vendorCustom, setVendorCustom] = useState('');
  const [displayName, setDisplayName] = useState(row?.displayName ?? '');
  const [monthlyHkd, setMonthlyHkd] = useState(row ? String(row.monthlyHkd) : '');
  const [monthlyAmountOriginal, setMonthlyAmountOriginal] = useState(
    row?.monthlyAmountOriginal !== undefined && row?.monthlyAmountOriginal !== null
      ? String(row.monthlyAmountOriginal)
      : '',
  );
  const [currencyOriginal, setCurrencyOriginal] = useState(row?.currencyOriginal ?? '');
  const [billingDay, setBillingDay] = useState(row?.billingDay ?? 1);
  const [purposeAccount, setPurposeAccount] = useState(row?.purposeAccount ?? PURPOSE_PRESET);
  const [fundingAccount, setFundingAccount] = useState(row?.fundingAccount ?? '');
  const [startedAt, setStartedAt] = useState(row ? row.startedAt.slice(0, 10) : todayISO());
  const [endedAt, setEndedAt] = useState(row?.endedAt?.slice(0, 10) ?? '');
  const [active, setActive] = useState(row?.active ?? true);
  const [notes, setNotes] = useState(row?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const finalVendor = vendor === 'OTHER' ? vendorCustom.trim() || 'OTHER' : vendor;
      const payload = {
        vendor: finalVendor,
        displayName: displayName.trim(),
        monthlyHkd: Number(monthlyHkd),
        monthlyAmountOriginal: monthlyAmountOriginal
          ? Number(monthlyAmountOriginal)
          : null,
        currencyOriginal: currencyOriginal.trim() || null,
        billingDay: Number(billingDay),
        purposeAccount: purposeAccount.trim() || PURPOSE_PRESET,
        fundingAccount: fundingAccount.trim(),
        startedAt,
        endedAt: endedAt || null,
        active,
        notes: notes.trim() || null,
      };
      const url =
        mode === 'create'
          ? '/api/admin/ai-subscriptions'
          : `/api/admin/ai-subscriptions/${row!.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.hint ?? j.error ?? `HTTP ${r.status}`);
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-800">
            {mode === 'create' ? '＋ 新建订阅' : `✏️ 编辑：${row!.displayName}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-slate-400 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="平台 (vendor)" required>
            <select
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              className={inputCls}
            >
              {VENDOR_PRESETS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
            {vendor === 'OTHER' && (
              <input
                placeholder="自定义 vendor 标签，如 RUNWAY"
                value={vendorCustom}
                onChange={(e) => setVendorCustom(e.target.value)}
                className={`${inputCls} mt-1`}
              />
            )}
          </Field>
          <Field label="订阅名称 *" hint="给老板看的展示名">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例：Perplexity Pro · Yoyo 账号"
              className={inputCls}
            />
          </Field>

          <Field label="月费 HKD *" hint="折算成 HKD 后的月费">
            <input
              type="number"
              step="0.01"
              min={0}
              value={monthlyHkd}
              onChange={(e) => setMonthlyHkd(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="每月扣款日" hint="1-28 之间，避开月底">
            <input
              type="number"
              min={1}
              max={28}
              value={billingDay}
              onChange={(e) => setBillingDay(Number(e.target.value))}
              className={inputCls}
            />
          </Field>

          <Field label="原始月费" hint="外币订阅时填，可选">
            <input
              type="number"
              step="0.01"
              min={0}
              value={monthlyAmountOriginal}
              onChange={(e) => setMonthlyAmountOriginal(e.target.value)}
              placeholder="例：20"
              className={inputCls}
            />
          </Field>
          <Field label="原始币种" hint="例 USD / CNY，可选">
            <input
              value={currencyOriginal}
              onChange={(e) => setCurrencyOriginal(e.target.value)}
              placeholder="USD"
              className={inputCls}
            />
          </Field>

          <Field label="用途科目 (借) *" hint="月底 voucher 写入哪个费用科目">
            <input
              list="purpose-options"
              value={purposeAccount}
              onChange={(e) => setPurposeAccount(e.target.value)}
              placeholder={PURPOSE_PRESET}
              className={`${inputCls} font-mono`}
            />
            <datalist id="purpose-options">
              <option value={PURPOSE_PRESET} />
              <option value="管理费用-IT 服务费" />
              <option value="销售费用-AI 服务费" />
            </datalist>
          </Field>
          <Field label="扣自科目 (贷) *" hint="钱从哪个挂账走，建议「平台预付」">
            <input
              list="funding-options"
              value={fundingAccount}
              onChange={(e) => setFundingAccount(e.target.value)}
              placeholder="例：Perplexity 平台预付"
              className={`${inputCls} font-mono`}
            />
            <datalist id="funding-options">
              {COMMON_FUNDING_ACCOUNTS.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </Field>

          <Field label="起始日期 *">
            <input
              type="date"
              value={startedAt}
              onChange={(e) => setStartedAt(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="结束日期" hint="留空 = 仍在用">
            <input
              type="date"
              value={endedAt}
              onChange={(e) => setEndedAt(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        <div className="mt-3">
          <label className="flex items-baseline gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <span>启用 (active)</span>
            <span className="text-[10px] text-slate-400">
              不启用的订阅月底不会被算进入账
            </span>
          </label>
        </div>

        <div className="mt-3">
          <Field label="备注" hint="选填，给凭证编制员当上下文">
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例：MC Markets 项目用 / 老板个人 / 试用期到 X 月"
              className={inputCls}
            />
          </Field>
        </div>

        {err && (
          <div className="mt-3 rounded bg-rose-100 px-3 py-2 text-xs text-rose-800">{err}</div>
        )}

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
            disabled={busy || !displayName.trim() || !monthlyHkd || !fundingAccount.trim()}
            className="rounded-md bg-rose-700 px-4 py-1.5 text-sm font-medium text-amber-50 hover:bg-rose-800 disabled:opacity-50"
          >
            {busy ? '保存中…' : mode === 'create' ? '创建' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'mt-0.5 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-amber-500 focus:outline-none';

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-slate-600">
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
        {hint && (
          <span className="ml-1.5 text-[10px] font-normal text-slate-400">{hint}</span>
        )}
      </span>
      {children}
    </label>
  );
}
