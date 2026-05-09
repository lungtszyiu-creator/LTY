'use client';

/**
 * 财务页头部工具栏 — 手动添加钱包 / 银行账户 + 钱包去重
 *
 * 老板要求 (2026-05-09):
 *   - 手动添加钱包按钮（不只能从 vault ETL 灌 / AI 调 wallets API）
 *   - 同上但银行账户
 *   - 钱包大小写重复 dedup（仅 SUPER_ADMIN）
 *
 * 三个按钮:
 *   - + 添加钱包 → 弹模态框，填 label/chain/address/holderType/purpose
 *   - + 添加银行账户 → 弹模态框，填 label/bankName/accountType/number/currency/notes
 *   - 🧹 钱包去重（仅 SUPER_ADMIN）→ 调 dedup endpoint，先 dryRun 后真跑
 *
 * 权限分两层（在父 server component 校验过）:
 *   - canEdit: 财务 EDITOR 才能加钱包/银行（手动写库）
 *   - isSuperAdmin: 仅老板能看到 dedup 按钮（destructive）
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function AddWalletBankBar({
  canEdit,
  isSuperAdmin,
}: {
  canEdit: boolean;
  isSuperAdmin: boolean;
}) {
  const [walletOpen, setWalletOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [dedupOpen, setDedupOpen] = useState(false);

  if (!canEdit && !isSuperAdmin) return null;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => setWalletOpen(true)}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-700"
            >
              ＋ 添加钱包
            </button>
            <button
              type="button"
              onClick={() => setBankOpen(true)}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-700"
            >
              ＋ 添加银行账户
            </button>
          </>
        )}
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setDedupOpen(true)}
            className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
            title="按 (chain, lower(address)) 找重复钱包合并 + 全部地址转小写"
          >
            🧹 钱包去重
          </button>
        )}
      </div>

      {walletOpen && <WalletDialog onClose={() => setWalletOpen(false)} />}
      {bankOpen && <BankDialog onClose={() => setBankOpen(false)} />}
      {dedupOpen && <DedupDialog onClose={() => setDedupOpen(false)} />}
    </>
  );
}

// ============ 模态框: 添加钱包 ============

function WalletDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [chain, setChain] = useState('ETH');
  const [address, setAddress] = useState('');
  const [holderType, setHolderType] = useState<'BOSS' | 'COMPANY_CASHIER' | 'EMPLOYEE' | 'TREASURY' | 'EXTERNAL'>(
    'COMPANY_CASHIER',
  );
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    setErr(null);
    if (!label.trim() || !address.trim()) {
      setErr('label / address 必填');
      return;
    }
    if (chain === 'ETH' && !/^0x[0-9a-fA-F]{40}$/.test(address.trim())) {
      setErr('ETH 地址格式不对（应是 0x 开头 40 位 hex）');
      return;
    }
    startTransition(async () => {
      const r = await fetch('/api/finance/wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          chain,
          address: address.trim(),
          holderType,
          purpose: purpose.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.error ?? `HTTP ${r.status}`);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal title="＋ 添加钱包" onClose={onClose}>
      <div className="space-y-3">
        <Field label="标签 *" hint="人类可读，例：老板备用钱包 / TRON 出纳">
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} autoFocus />
        </Field>
        <Field label="链">
          <select value={chain} onChange={(e) => setChain(e.target.value)} className={inputCls}>
            <option value="ETH">ETH (ERC-20)</option>
            <option value="TRON">TRON (TRC-20)</option>
            <option value="SOL">SOL</option>
            <option value="BSC">BSC</option>
            <option value="POLYGON">Polygon</option>
          </select>
        </Field>
        <Field label="地址 *" hint="ETH 是 0x 开头 40 hex；保存时自动转小写">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x..."
            className={`${inputCls} font-mono text-xs`}
          />
        </Field>
        <Field label="持有人类型">
          <select
            value={holderType}
            onChange={(e) => setHolderType(e.target.value as typeof holderType)}
            className={inputCls}
          >
            <option value="BOSS">老板</option>
            <option value="COMPANY_CASHIER">公司出纳</option>
            <option value="EMPLOYEE">员工</option>
            <option value="TREASURY">储备</option>
            <option value="EXTERNAL">外部</option>
          </select>
        </Field>
        <Field label="用途（可选）">
          <input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="例：MC Markets 月费收款 / 员工工资发放"
            className={inputCls}
          />
        </Field>
        <Field label="备注（可选）">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      {err && <div className="mt-3 rounded bg-rose-100 px-3 py-2 text-xs text-rose-800">{err}</div>}

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
          disabled={pending}
          className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {pending ? '保存中…' : '保存'}
        </button>
      </div>
    </Modal>
  );
}

// ============ 模态框: 添加银行账户 ============

function BankDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountType, setAccountType] = useState<'BASIC' | 'CAPITAL' | 'GENERAL' | 'PAYROLL' | 'FX'>('BASIC');
  const [accountNumber, setAccountNumber] = useState('');
  const [currency, setCurrency] = useState('RMB');
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    setErr(null);
    if (!label.trim() || !bankName.trim() || !accountNumber.trim()) {
      setErr('label / 银行名 / 账号 必填');
      return;
    }
    startTransition(async () => {
      const r = await fetch('/api/finance/bank-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          bankName: bankName.trim(),
          accountType,
          accountNumber: accountNumber.trim(),
          currency: currency.trim().toUpperCase(),
          notes: notes.trim() || null,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.error ?? `HTTP ${r.status}`);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal title="＋ 添加银行账户" onClose={onClose}>
      <div className="space-y-3">
        <Field label="标签 *" hint="人类可读，例：工商基本户 / 汇丰港币户">
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} autoFocus />
        </Field>
        <Field label="银行名 *">
          <input
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="例：中国工商银行 / 汇丰银行"
            className={inputCls}
          />
        </Field>
        <Field label="账户类型">
          <select
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as typeof accountType)}
            className={inputCls}
          >
            <option value="BASIC">基本户</option>
            <option value="CAPITAL">资本户</option>
            <option value="GENERAL">一般户</option>
            <option value="PAYROLL">工资户</option>
            <option value="FX">外汇户</option>
          </select>
        </Field>
        <Field label="账号 *">
          <input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            className={`${inputCls} font-mono text-xs`}
          />
        </Field>
        <Field label="币种">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
            <option value="RMB">RMB</option>
            <option value="HKD">HKD</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </Field>
        <Field label="备注（可选）">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="用途 / 联系人 / 网银状态"
            className={inputCls}
          />
        </Field>
      </div>

      {err && <div className="mt-3 rounded bg-rose-100 px-3 py-2 text-xs text-rose-800">{err}</div>}

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
          disabled={pending}
          className="rounded-md bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {pending ? '保存中…' : '保存'}
        </button>
      </div>
    </Modal>
  );
}

// ============ 模态框: 钱包去重 ============

function DedupDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  type Report = {
    ok: boolean;
    dryRun: boolean;
    summary: {
      totalWallets: number;
      duplicateGroups: number;
      lonelyWalletsLowercased: number;
      txTransferred: number;
      snapshotsTransferred: number;
      errorsCount: number;
    };
    merges: { keptLabel: string; canonicalAddress: string; deletedIds: string[] }[];
    lowercased: { id: string; oldAddress: string; newAddress: string }[];
    errors: string[];
  };
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function run(dryRun: boolean) {
    if (!dryRun) {
      const ok = confirm(
        '真跑会合并重复钱包行 + 把大写地址转小写。建议先 Dry-run 看报告。继续真跑吗？',
      );
      if (!ok) return;
    }
    setErr(null);
    setReport(null);
    startTransition(async () => {
      const r = await fetch('/api/admin/finance/dedup-wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.error ?? `HTTP ${r.status}`);
        return;
      }
      setReport(j);
      if (!dryRun) router.refresh();
    });
  }

  return (
    <Modal title="🧹 钱包去重 + 地址归一化" onClose={onClose}>
      <p className="text-sm text-slate-700">
        ETH 地址 EIP-55 是 mixed case，但底层是同一地址。本工具找 (chain, lower(address)) 重复的钱包，合并关联 ChainTransaction / WalletBalanceSnapshot 到 canonical 行（优先保留 vault 来源），剩下行 address 全部转小写。
      </p>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => run(true)}
          disabled={pending}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          🧪 Dry-run（不写库）
        </button>
        <button
          type="button"
          onClick={() => run(false)}
          disabled={pending}
          className="rounded-lg bg-rose-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-rose-800 disabled:opacity-50"
        >
          🚀 真跑
        </button>
      </div>

      {err && <div className="mt-3 rounded bg-rose-100 px-3 py-2 text-xs text-rose-800">{err}</div>}

      {report && (
        <div className="mt-4 space-y-2 text-sm">
          <div
            className={`rounded-lg px-3 py-2 ${
              report.dryRun
                ? 'bg-sky-100 text-sky-900 ring-1 ring-sky-300'
                : 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300'
            }`}
          >
            {report.dryRun ? '🧪 Dry-run 跑完（DB 没改）' : '🚀 真跑完毕'}
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
            总钱包 {report.summary.totalWallets} ｜ 重复组 {report.summary.duplicateGroups} ｜
            单条转小写 {report.summary.lonelyWalletsLowercased} ｜ 转移交易 {report.summary.txTransferred} ｜
            转移快照 {report.summary.snapshotsTransferred} ｜ 错误 {report.summary.errorsCount}
          </div>
          {report.merges.length > 0 && (
            <details className="rounded-lg bg-slate-50 p-2 text-xs">
              <summary className="cursor-pointer font-medium">合并明细 ({report.merges.length})</summary>
              <ul className="mt-2 space-y-1">
                {report.merges.map((m, i) => (
                  <li key={i} className="font-mono text-[11px]">
                    保留「{m.keptLabel}」({m.canonicalAddress}) · 删 {m.deletedIds.length} 条
                  </li>
                ))}
              </ul>
            </details>
          )}
          {report.errors.length > 0 && (
            <ul className="rounded-lg bg-rose-50 p-2 text-[11px] text-rose-800">
              {report.errors.map((e, i) => (
                <li key={i} className="font-mono">· {e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          关闭
        </button>
      </div>
    </Modal>
  );
}

// ============ 通用 ============

const inputCls =
  'mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-amber-500 focus:outline-none';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[10px] text-slate-500">{hint}</span>}
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
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
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
