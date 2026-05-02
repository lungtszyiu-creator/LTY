'use client';

/**
 * 凭证审批操作组件（client）
 *
 * 老板（EDITOR）才看到 3 个按钮：Approve / Reject / Void。
 * Reject / Void 强制要写理由。成功后 router.refresh() 让 server component 重渲染。
 */
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type Status = 'AI_DRAFT' | 'BOSS_REVIEWING' | 'POSTED' | 'REJECTED' | 'VOIDED';

export function VoucherActions({
  voucherId,
  status,
  isSuperAdmin = false,
}: {
  voucherId: string;
  status: Status;
  /** 仅总管理者（SUPER_ADMIN）能看到永久删除按钮，财务出纳设了 EDITOR 也不行 */
  isSuperAdmin?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openReject, setOpenReject] = useState(false);
  const [openVoid, setOpenVoid] = useState(false);
  const [reason, setReason] = useState('');

  const canApproveOrReject = status === 'AI_DRAFT' || status === 'BOSS_REVIEWING';
  const canVoid = status === 'POSTED';
  // 删除：POSTED 不可（要先 VOID 留痕），其它状态都可删
  const canDelete = isSuperAdmin && status !== 'POSTED';

  async function call(body: object) {
    setError(null);
    const res = await fetch(`/api/finance/vouchers/${voucherId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? `HTTP ${res.status}`);
      return false;
    }
    return true;
  }

  function onDelete() {
    if (!confirm('永久删除这张凭证？\n\n该操作不可恢复，仅用于清理早期/无标记的测试残留数据。\n（已过账的凭证请先作废，留下审计痕迹后再删。）')) return;
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/finance/vouchers/${voucherId}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.hint ?? j.error ?? `HTTP ${res.status}`);
        return;
      }
      router.push('/finance');
      router.refresh();
    });
  }

  function onApprove() {
    if (!confirm('确认批准这张凭证？批准后会分配正式凭证号，状态进入 POSTED。')) return;
    startTransition(async () => {
      const ok = await call({ action: 'approve' });
      if (ok) router.refresh();
    });
  }

  function onSubmitReject() {
    if (!reason.trim()) {
      setError('请写驳回理由');
      return;
    }
    startTransition(async () => {
      const ok = await call({ action: 'reject', reason: reason.trim() });
      if (ok) {
        setOpenReject(false);
        setReason('');
        router.refresh();
      }
    });
  }

  function onSubmitVoid() {
    if (!reason.trim()) {
      setError('请写作废理由');
      return;
    }
    startTransition(async () => {
      const ok = await call({ action: 'void', reason: reason.trim() });
      if (ok) {
        setOpenVoid(false);
        setReason('');
        router.refresh();
      }
    });
  }

  // 老板永久删按钮即便其他 action 都不能用也要露出（清理测试残留）
  if (!canApproveOrReject && !canVoid && !canDelete) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-sm text-slate-500">
        当前状态 <strong>{status}</strong> 不可再操作。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canApproveOrReject && (
          <>
            <button
              type="button"
              onClick={onApprove}
              disabled={pending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            >
              ✅ 批准（POSTED）
            </button>
            <button
              type="button"
              onClick={() => {
                setOpenReject(!openReject);
                setOpenVoid(false);
                setError(null);
              }}
              disabled={pending}
              className="rounded-lg bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100 disabled:opacity-50"
            >
              ❌ 驳回（REJECTED）
            </button>
          </>
        )}
        {canVoid && (
          <button
            type="button"
            onClick={() => {
              setOpenVoid(!openVoid);
              setOpenReject(false);
              setError(null);
            }}
            disabled={pending}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-200 disabled:opacity-50"
          >
            🗑 作废（VOIDED）
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="ml-auto rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
            title="永久删除（仅总管理者，POSTED 凭证须先作废）"
          >
            🗑️ 永久删除
          </button>
        )}
      </div>

      {(openReject || openVoid) && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <label className="block text-xs font-medium text-slate-600">
            {openReject ? '驳回理由（必填）' : '作废理由（必填）'}
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例如：金额跟单据不一致 / 借贷方科目错误 / 重复入账..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={openReject ? onSubmitReject : onSubmitVoid}
              disabled={pending}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
            >
              {pending ? '提交中...' : '确认提交'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpenReject(false);
                setOpenVoid(false);
                setReason('');
                setError(null);
              }}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </div>
      )}
    </div>
  );
}
