'use client';

/**
 * 看板召唤管家 ingest · 老板手机一键
 *
 * 流程：
 * 1. 点按钮 → POST /api/knowledge/ingest（含已运行检测）
 * 2. 拿到 id 后每 5 秒 poll /api/knowledge/ingest/<id>
 * 3. 状态 done | error 时停止 + 展示结果 markdown
 *
 * Mac 端 IngestWorker 30s 轮询 /api/knowledge/ingest/pending（claimed 后跑 claude -p）
 * 所以点完最长可能等 30-90 秒才看到 status 从 pending → running，再几分钟看到 done。
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type IngestState =
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'tracking'; id: string; status: string; result?: string; error?: string; commitSha?: string }
  | { kind: 'busy'; existingId: string; detail: string };

const POLL_MS = 5000;

export default function IngestButton() {
  const [state, setState] = useState<IngestState>({ kind: 'idle' });
  const router = useRouter();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startPolling(id: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/knowledge/ingest/${id}`, { cache: 'no-store' });
        if (!r.ok) return;
        const data = await r.json();
        const newState: IngestState = {
          kind: 'tracking',
          id,
          status: data.status,
          result: data.result ?? undefined,
          error: data.errorMessage ?? undefined,
          commitSha: data.commitSha ?? undefined,
        };
        setState(newState);
        if (data.status === 'done' || data.status === 'error') {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          // refresh server component to update other sections
          router.refresh();
        }
      } catch {
        /* ignore transient */
      }
    }, POLL_MS);
  }

  async function fire() {
    setState({ kind: 'requesting' });
    try {
      const r = await fetch('/api/knowledge/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'all_inbox' }),
      });
      const data = await r.json();
      if (r.status === 409 && data.existingId) {
        setState({ kind: 'busy', existingId: data.existingId, detail: data.detail || 'busy' });
        startPolling(data.existingId);
        return;
      }
      if (!r.ok) {
        setState({
          kind: 'tracking',
          id: '?',
          status: 'error',
          error: data.error || 'unknown',
        });
        return;
      }
      startPolling(data.id);
      setState({ kind: 'tracking', id: data.id, status: data.status });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'unknown';
      setState({ kind: 'tracking', id: '?', status: 'error', error: msg });
    }
  }

  const inProgress =
    state.kind === 'requesting' ||
    state.kind === 'busy' ||
    (state.kind === 'tracking' && (state.status === 'pending' || state.status === 'claimed' || state.status === 'running'));

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={inProgress}
        onClick={fire}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
      >
        🤖 召唤管家 ingest 全部 _inbox
      </button>

      {state.kind === 'requesting' && (
        <Hint kind="info" text="提交请求中..." />
      )}

      {state.kind === 'busy' && (
        <Hint kind="warn" text={`已有进行中的 ingest（id ${state.existingId.slice(0, 8)}），切换为跟踪模式。`} />
      )}

      {state.kind === 'tracking' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-xs text-amber-900">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium">
              <StatusBadge status={state.status} /> id <code className="rounded bg-white px-1">{state.id.slice(0, 8)}</code>
            </span>
            {state.commitSha && (
              <code className="rounded bg-white px-1 text-[10px]">commit {state.commitSha.slice(0, 7)}</code>
            )}
          </div>
          {state.error && (
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-rose-50 px-2 py-1 text-[11px] text-rose-900 ring-1 ring-rose-200">
              {state.error}
            </pre>
          )}
          {state.result && (
            <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-white px-2 py-1 text-[11px] text-slate-800 ring-1 ring-slate-200">
              {state.result}
            </pre>
          )}
          {!state.error && !state.result && state.status !== 'done' && state.status !== 'error' && (
            <p className="text-[11px] text-amber-700">
              {state.status === 'pending'
                ? '等 Mac IngestWorker 拉走（最长 30 秒）'
                : state.status === 'claimed'
                ? 'Mac 已认领，准备启动 claude headless'
                : 'claude 在跑（读 _inbox + 改 wiki/，可能要几分钟）'}
            </p>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        点一下 = 让管家把 <code className="rounded bg-slate-100 px-1">~/LTY旭珑/raw/_inbox/</code> 全部 ingest 进 wiki/
      </p>
    </div>
  );
}

function Hint({ kind, text }: { kind: 'info' | 'warn'; text: string }) {
  const cls =
    kind === 'info'
      ? 'border-sky-200 bg-sky-50/60 text-sky-900'
      : 'border-amber-200 bg-amber-50/60 text-amber-900';
  return <div className={`rounded-xl border px-3 py-2 text-xs ${cls}`}>{text}</div>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: '⏳ pending', cls: 'bg-slate-50 text-slate-700 ring-slate-200' },
    claimed: { label: '🎯 claimed', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
    running: { label: '🔄 running', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
    done: { label: '✅ done', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    error: { label: '❌ error', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  };
  const m = map[status] ?? { label: status, cls: 'bg-slate-50 text-slate-600 ring-slate-200' };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${m.cls}`}>
      {m.label}
    </span>
  );
}
