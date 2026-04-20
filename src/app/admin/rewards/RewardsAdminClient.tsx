'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import FileUpload, { type UploadedFile } from '@/components/FileUpload';

type Attachment = { id: string; filename: string; storedPath: string; mimeType: string; size: number; createdAt: string };
type Reward = {
  id: string;
  taskId: string;
  rewardText: string | null;
  points: number;
  method: string;
  status: string;
  note: string | null;
  rejectReason: string | null;
  issuedAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
  updatedAt: string;
  task: { id: string; title: string; reward: string | null; points: number };
  recipient: { id: string; name: string | null; email: string; image: string | null };
  issuedBy: { id: string; name: string | null; email: string } | null;
  receipts: Attachment[];
};

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  PENDING:      { label: '待发放',  cls: 'bg-amber-50 text-amber-800 ring-amber-200',     dot: 'bg-amber-500' },
  ISSUED:       { label: '已发放',  cls: 'bg-sky-50 text-sky-700 ring-sky-200',           dot: 'bg-sky-500' },
  ACKNOWLEDGED: { label: '已确认',  cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  DISPUTED:     { label: '有异议',  cls: 'bg-rose-50 text-rose-700 ring-rose-200',         dot: 'bg-rose-500' },
  CANCELLED:    { label: '已取消',  cls: 'bg-slate-100 text-slate-500 ring-slate-200',     dot: 'bg-slate-400' },
};

const METHOD_LABEL: Record<string, string> = {
  CASH: '现金', TRANSFER: '转账', VOUCHER: '代金券', IN_KIND: '实物', POINTS_ONLY: '仅积分', OTHER: '其他',
};

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'PENDING', label: '待发放' },
  { key: 'ISSUED', label: '已发放' },
  { key: 'ACKNOWLEDGED', label: '已确认' },
  { key: 'DISPUTED', label: '有异议' },
];

function fmt(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : '';
}

function initial(s: string | null | undefined) {
  return (s || '?').slice(0, 1).toUpperCase();
}

export default function RewardsAdminClient({ initial, meId }: { initial: Reward[]; meId: string }) {
  const [items, setItems] = useState<Reward[]>(initial);
  const [filter, setFilter] = useState<string>('PENDING');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.status === filter)),
    [items, filter]
  );

  async function patch(id: string, data: any) {
    const res = await fetch(`/api/rewards/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) { alert((await res.json()).error ?? '操作失败'); return null; }
    const updated = await res.json();
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated, receipts: p.receipts } : p)));
    return updated;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm transition ${
              filter === f.key
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white/70 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card py-14 text-center text-sm text-slate-500">
          当前筛选下没有记录
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => (
            <RewardRow
              key={r.id}
              item={r}
              meId={meId}
              expanded={expanded === r.id}
              onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
              onPatch={patch}
              onReplaceReceipts={(newList) =>
                setItems((prev) => prev.map((p) => (p.id === r.id ? { ...p, receipts: newList } : p)))
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function RewardRow({
  item,
  meId,
  expanded,
  onToggle,
  onPatch,
  onReplaceReceipts,
}: {
  item: Reward;
  meId: string;
  expanded: boolean;
  onToggle: () => void;
  onPatch: (id: string, data: any) => Promise<any>;
  onReplaceReceipts: (list: Attachment[]) => void;
}) {
  const isSelf = item.recipient.id === meId;
  const router = useRouter();
  const meta = STATUS_META[item.status] ?? STATUS_META.PENDING;

  const [method, setMethod] = useState(item.method);
  const [rewardText, setRewardText] = useState(item.rewardText ?? '');
  const [points, setPoints] = useState(item.points);
  const [note, setNote] = useState(item.note ?? '');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);

  async function markIssued() {
    if (isSelf) {
      alert('不能给自己标记已发放。请让另一位管理员处理，避免利益冲突。');
      return;
    }
    setBusy(true);
    try {
      await onPatch(item.id, {
        status: 'ISSUED',
        method,
        rewardText: rewardText || null,
        points,
        note: note || null,
        receiptAttachmentIds: files.map((f) => f.id),
      });
      router.refresh();
      setFiles([]);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      await onPatch(item.id, {
        method,
        rewardText: rewardText || null,
        points,
        note: note || null,
        receiptAttachmentIds: files.map((f) => f.id),
      });
      router.refresh();
      setFiles([]);
    } finally {
      setBusy(false);
    }
  }

  async function revert() {
    if (!confirm('撤回发放状态？该条目会重新回到"待发放"。')) return;
    setBusy(true);
    try { await onPatch(item.id, { status: 'PENDING' }); router.refresh(); } finally { setBusy(false); }
  }

  async function rejectWithReason() {
    const reason = prompt('驳回理由（必填，会邮件通知收款人 + 留档）：');
    if (!reason || !reason.trim()) return;
    setBusy(true);
    try {
      await onPatch(item.id, { status: 'CANCELLED', rejectReason: reason.trim() });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="card rise overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-300 to-red-400 text-sm font-semibold text-white">
              {initial(item.recipient.name ?? item.recipient.email)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{item.recipient.name ?? item.recipient.email}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ${meta.cls}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                  {meta.label}
                </span>
              </div>
              <Link href={`/tasks/${item.task.id}`} className="mt-0.5 line-clamp-1 block text-sm text-slate-700 underline-offset-2 hover:underline">
                {item.task.title}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                {item.rewardText && <span>🎁 {item.rewardText}</span>}
                {item.points > 0 && <span>{item.points} 分</span>}
                <span>· {METHOD_LABEL[item.method] ?? item.method}</span>
                <span>· 创建于 {fmt(item.createdAt)}</span>
                {item.issuedAt && <span>· 发放 {fmt(item.issuedAt)}</span>}
                {item.acknowledgedAt && <span>· 确认 {fmt(item.acknowledgedAt)}</span>}
              </div>
            </div>
          </div>
          <button onClick={onToggle} className="btn btn-ghost text-xs">
            {expanded ? '收起' : item.status === 'PENDING' ? '去发放 →' : '查看详情 →'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/40 p-4 sm:p-5">
          {isSelf && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              ⚠️ 这条奖励的收款人就是你。为避免利益冲突，你不能给自己标记"已发放"——请让另一位管理员处理。
            </div>
          )}
          {item.rejectReason && item.status === 'CANCELLED' && (
            <div className="mb-4 rounded-lg bg-rose-50 px-3 py-2.5 text-xs text-rose-700 ring-1 ring-rose-200">
              <div className="font-medium">已驳回 · 理由：</div>
              <div className="mt-0.5 whitespace-pre-wrap">{item.rejectReason}</div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">奖励内容</label>
              <input
                value={rewardText}
                onChange={(e) => setRewardText(e.target.value)}
                placeholder="¥500 / 奶茶一杯 / 项目奖金 10%"
                className="input"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">发放方式</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className="select">
                {Object.entries(METHOD_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">积分</label>
              <input
                type="number"
                min={0}
                max={99999}
                value={points}
                onChange={(e) => setPoints(Math.max(0, Math.min(99999, Number(e.target.value))))}
                className="input"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">备注 / 说明</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="转账流水号、交接细节、特殊说明等"
              className="textarea"
            />
          </div>

          {item.receipts.length > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">已上传凭证</div>
              <ul className="flex flex-wrap gap-2">
                {item.receipts.map((a) => (
                  <li key={a.id}>
                    <a href={`/api/attachments/${a.id}`} target="_blank" className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-xs ring-1 ring-slate-200 hover:bg-slate-50">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 10-5.656-5.656L5.757 10.586a6 6 0 108.485 8.485L20 13.828" /></svg>
                      {a.filename}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">上传凭证（转账截图、签收照等）</label>
            <FileUpload onChange={setFiles} />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/70 pt-4">
            {item.status !== 'CANCELLED' && (
              <button onClick={rejectWithReason} disabled={busy} className="btn btn-ghost text-xs text-rose-600 ring-1 ring-rose-200">
                驳回（不予发放）
              </button>
            )}
            {item.status === 'PENDING' && (
              <button
                onClick={markIssued}
                disabled={busy || isSelf}
                title={isSelf ? '不能给自己发放' : undefined}
                className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? '保存中…' : '✓ 标记已发放'}
              </button>
            )}
            {(item.status === 'ISSUED' || item.status === 'ACKNOWLEDGED' || item.status === 'DISPUTED' || item.status === 'CANCELLED') && (
              <>
                {item.status !== 'CANCELLED' && (
                  <button onClick={save} disabled={busy} className="btn btn-ghost">
                    保存修改
                  </button>
                )}
                <button onClick={revert} disabled={busy} className="btn btn-ghost text-amber-700">
                  恢复到"待发放"
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
