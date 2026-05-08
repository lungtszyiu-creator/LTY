'use client';

/**
 * Bridge 在线探活 — fetch /healthz 看 finance_bridge 是不是在跑 + LLM proxy
 * 是不是 enabled。Tailscale Funnel URL 公网可访问，但当 Mac 关机/休眠时
 * 会 timeout。
 */
import { useState, useTransition } from 'react';

type HealthResp = {
  ok?: boolean;
  roles?: string[];
  inbound_enabled?: boolean;
  llm_proxy_enabled?: boolean;
  llm_proxy_dashboard?: string | null;
  entry_bot?: string | null;
};

export function HealthCheckButton({ bridgeUrl }: { bridgeUrl: string }) {
  const [pending, startTransition] = useTransition();
  const [health, setHealth] = useState<HealthResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  function check() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await fetch(`${bridgeUrl}/healthz`, { cache: 'no-store' });
        if (!r.ok) {
          setError(`HTTP ${r.status}`);
          setHealth(null);
        } else {
          const j: HealthResp = await r.json();
          setHealth(j);
        }
        setCheckedAt(new Date().toLocaleTimeString('zh-HK', { hour12: false }));
      } catch (e) {
        setError(
          e instanceof Error
            ? `${e.message} （Mac 可能关机 / 睡眠 / Tailscale 断了）`
            : '未知错误',
        );
        setHealth(null);
      }
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            finance_bridge 探活
          </h2>
          <div className="mt-0.5 truncate font-mono text-[11px] text-slate-500">{bridgeUrl}</div>
        </div>
        <button
          type="button"
          onClick={check}
          disabled={pending}
          className="rounded-lg bg-violet-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-violet-800 disabled:opacity-50"
        >
          {pending ? '探测中…' : '🩺 现在测一下'}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-300">
          ❌ bridge 不在线：{error}
        </div>
      )}

      {health && (
        <div className="mt-3 space-y-1.5 rounded-lg bg-slate-50 p-3 text-sm">
          <Row
            label="bridge 在线"
            ok={health.ok === true}
            value={health.ok ? '✅ 是' : '❌ 否'}
          />
          <Row
            label="LLM proxy"
            ok={health.llm_proxy_enabled === true}
            value={health.llm_proxy_enabled ? '✅ 已开（/llm/* 路由可用）' : '❌ 未开 — config.yaml 改 llm_proxy.enabled: true 重启'}
          />
          <Row
            label="入站 (TG → Coze)"
            ok={health.inbound_enabled === true}
            value={
              health.inbound_enabled
                ? `✅ 开 · entry_bot=${health.entry_bot ?? 'unknown'}`
                : '⏸ 未开'
            }
          />
          <Row
            label="财务 AI bot 路由"
            ok={(health.roles?.length ?? 0) > 0}
            value={(health.roles ?? []).join(' / ') || '空'}
          />
          <Row
            label="LLM 上报目标"
            ok={!!health.llm_proxy_dashboard}
            value={health.llm_proxy_dashboard || '— 未配 dashboard_base_url'}
          />
          {checkedAt && <div className="pt-1 text-[10px] text-slate-400">测于 {checkedAt}</div>}
        </div>
      )}
    </div>
  );
}

function Row({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12px]">
      <span className="font-medium text-slate-600">{label}</span>
      <span className={`font-mono text-[11px] tabular-nums ${ok ? 'text-emerald-800' : 'text-rose-800'}`}>
        {value}
      </span>
    </div>
  );
}
