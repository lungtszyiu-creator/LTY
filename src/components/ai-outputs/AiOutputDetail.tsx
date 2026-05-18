'use client';

/**
 * AI 输出审核详情（client component）
 *
 * 显示 AiOutput 完整内容（主报告 / 修订版 / 签约版 / metadata / source / 已审核结果）。
 * pending 状态下显示 approve / reject 按钮（仅 canReview=true 时）；按钮触发
 * server action via fetch POST 部门 `_actions` 路由。
 *
 * 设计选择：直接发 POST 到 `${basePath}/api/ai-output-review`（per-dept route）
 * 走 server action 路径太曲折；用 form + fetch + router.refresh 最直接。
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  type AiOutputRow,
  REVIEW_STATUS_LABEL,
  REVIEW_STATUS_CLS,
  OUTPUT_TYPE_LABEL,
} from './types';

export function AiOutputDetail({
  row,
  basePath,
  canReview,
}: {
  row: AiOutputRow;
  basePath: string;
  canReview: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const reviewable = row.reviewStatus === 'pending_human_review' && canReview;

  async function submitReview(action: 'approve' | 'reject') {
    setErr(null);
    if (action === 'reject' && !note.trim()) {
      setErr('拒绝必须填理由');
      return;
    }
    try {
      const resp = await fetch(`${basePath}/api/ai-output-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, action, note: note.trim() || null }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setErr(data.error || data.hint || `HTTP ${resp.status}`);
        return;
      }
      // 成功 → 收起 form + 刷新当前 route（不滚动）
      setShowApprove(false);
      setShowReject(false);
      setNote('');
      startTransition(() => router.refresh());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-3 text-[13px]">
      {/* 顶部 meta 行 */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 text-[11px]">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ring-1 ${REVIEW_STATUS_CLS[row.reviewStatus]}`}
        >
          {REVIEW_STATUS_LABEL[row.reviewStatus]}
        </span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600">
          {OUTPUT_TYPE_LABEL[row.outputType] ?? row.outputType}
        </span>
        <span className="text-slate-500">{row.agentName}</span>
        {row.triggeredBy && (
          <span className="text-slate-500">
            触发：<code className="text-slate-700">{row.triggeredBy}</code>
          </span>
        )}
        <span className="font-mono tabular-nums text-slate-400">
          {new Date(row.createdAt).toLocaleString('zh-HK', { hour12: false })}
        </span>
        {row.tokenCostHkd !== null && (
          <span className="text-slate-500">HKD {Number(row.tokenCostHkd).toFixed(4)}</span>
        )}
        {row.outputId && (
          <span className="font-mono text-[10px] text-slate-400" title="Bot 提供的幂等 key">
            id={row.outputId}
          </span>
        )}
      </div>

      {/* 已审核状态：显示 reviewer / 时间 / 备注 / vault path */}
      {row.reviewStatus !== 'pending_human_review' && (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <strong className="text-slate-800">
              {row.reviewStatus === 'approved' ? '✅ 通过' : '❌ 拒绝'}
            </strong>
            {row.reviewedBy && (
              <span className="text-slate-500">
                · {row.reviewedBy.name ?? row.reviewedBy.email}
              </span>
            )}
            {row.reviewedAt && (
              <span className="font-mono tabular-nums text-slate-400">
                · {new Date(row.reviewedAt).toLocaleString('zh-HK', { hour12: false })}
              </span>
            )}
          </div>
          {row.reviewNote && (
            <p className="mt-1.5 whitespace-pre-wrap text-slate-700">{row.reviewNote}</p>
          )}
          {row.vaultPath && (
            <p className="mt-1.5 font-mono text-[10px] text-slate-500">
              已 commit：
              <a
                href={`https://github.com/lungtszyiu-creator/${row.deptSlug === 'mc-legal' ? 'mc-legal-vault' : 'lty-vault'}/blob/main/${encodePath(row.vaultPath)}`}
                target="_blank"
                rel="noreferrer"
                className="text-rose-700 hover:underline"
              >
                {row.vaultPath} ↗
              </a>
              {row.vaultCommitSha && (
                <span className="ml-2 text-slate-400">@{row.vaultCommitSha.slice(0, 7)}</span>
              )}
            </p>
          )}
        </div>
      )}

      {/* 主体：标题 + content_markdown */}
      <div>
        <h3 className="mb-1 text-base font-semibold text-slate-900">{row.title}</h3>
        <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 font-sans text-[12.5px] leading-relaxed text-slate-800">
          {row.contentMarkdown}
        </pre>
      </div>

      {/* 合同审查附录：3 文本（修订版 + 签约版） */}
      {row.revisedDoc && (
        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
            📝 修订版（{row.revisedDoc.length.toLocaleString()} 字）
          </summary>
          <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap border-t border-slate-100 p-3 text-[12px] leading-relaxed text-slate-700">
            {row.revisedDoc}
          </pre>
        </details>
      )}
      {row.cleanDoc && (
        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
            ✨ 签约版（{row.cleanDoc.length.toLocaleString()} 字）
          </summary>
          <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap border-t border-slate-100 p-3 text-[12px] leading-relaxed text-slate-700">
            {row.cleanDoc}
          </pre>
        </details>
      )}

      {/* metadata */}
      <MetadataDetails metadata={row.metadata} />


      {/* 原始输入 */}
      {row.sourceInput && (
        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-3 py-2 text-[12px] font-medium text-slate-500 hover:bg-slate-50">
            📥 原始输入（{row.sourceInput.length.toLocaleString()} 字 · audit 用）
          </summary>
          <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap border-t border-slate-100 p-3 text-[11px] leading-relaxed text-slate-500">
            {row.sourceInput}
          </pre>
        </details>
      )}

      {/* 审核操作（仅 pending + canReview） */}
      {reviewable && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50/60 p-3">
          <div className="mb-2 text-[11px] font-medium text-amber-900">
            审核操作
            <span className="ml-2 text-amber-700">
              · 通过 → 自动 commit 到 raw/{row.deptSlug === 'mc-legal' ? '(MC repo)' : '法务部'}/AI-审核通过/...
            </span>
          </div>
          {!showApprove && !showReject ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowApprove(true)}
                disabled={pending}
                className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                ✅ 通过 + 落 vault
              </button>
              <button
                type="button"
                onClick={() => setShowReject(true)}
                disabled={pending}
                className="inline-flex items-center rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-50 disabled:opacity-50"
              >
                ❌ 拒绝
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-slate-700">
                {showApprove ? '审核备注（选填，会随 markdown 一起 commit 到 vault）' : '拒绝理由（必填）'}
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[12px] focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                placeholder={showApprove ? '例：已核对甲方主体、金额、签字盖章；同意归档。' : '例：金额与发票不符，需 Bot 重新分析'}
              />
              {err && <p className="text-[11px] text-rose-700">⚠️ {err}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => submitReview(showApprove ? 'approve' : 'reject')}
                  disabled={pending}
                  className={`inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-white transition disabled:opacity-50 ${
                    showApprove ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {pending ? '处理中…' : showApprove ? '确认通过 + 落 vault' : '确认拒绝'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowApprove(false);
                    setShowReject(false);
                    setNote('');
                    setErr(null);
                  }}
                  disabled={pending}
                  className="inline-flex items-center rounded-lg bg-white px-3 py-1.5 text-sm text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {row.reviewStatus === 'pending_human_review' && !canReview && (
        <p className="text-[11px] text-slate-500">
          💡 你看得到但没审核权限。需要部门负责人 (LEAD) 或老板 (SUPER_ADMIN) 审。
        </p>
      )}
    </div>
  );
}

function encodePath(p: string): string {
  return p.split('/').map((s) => encodeURIComponent(s)).join('/');
}

/** metadata 单独包成 component — 把 unknown 收窄成 object 再渲染（防 JSX child 类型报错） */
function MetadataDetails({ metadata }: { metadata: unknown }) {
  if (!metadata || typeof metadata !== 'object') return null;
  const obj = metadata as Record<string, unknown>;
  if (Object.keys(obj).length === 0) return null;
  return (
    <details className="rounded-lg border border-slate-200 bg-white">
      <summary className="cursor-pointer px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
        🧾 metadata
      </summary>
      <pre className="max-h-[300px] overflow-auto border-t border-slate-100 p-3 font-mono text-[11px] leading-relaxed text-slate-700">
        {JSON.stringify(obj, null, 2)}
      </pre>
    </details>
  );
}
