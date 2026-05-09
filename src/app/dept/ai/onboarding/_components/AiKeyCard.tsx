'use client';

/**
 * 步骤 ② — 每个 AI 员工的 X-Api-Key 信息卡 + 工作流加节点的说明
 *
 * 看板永远不回显明文，老板自己保存的明文 key 应该以这里显示的 keyPrefix
 * 开头（如 lty_AbCdE...）。
 *
 * 工作流加节点的说明用 <details> 折叠，避免每张卡片都展开太长。
 * curl 测试模板用本 AI 的 keyPrefix 占位让老板替换。
 */
import { useState } from 'react';

type Employee = {
  id: string;
  name: string;
  role: string;
  deptSlug: string | null;
  active: boolean;
  paused: boolean;
  dailyLimitHkd: number;
};

type ApiKey = {
  keyPrefix: string;
  scope: string;
  active: boolean;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
};

export function AiKeyCard({
  employee,
  apiKey,
  tokenUsageUrl,
}: {
  employee: Employee;
  apiKey: ApiKey | null;
  tokenUsageUrl: string;
}) {
  const keyHint = apiKey ? `${apiKey.keyPrefix}<完整看板 key 的剩下部分>` : 'lty_xxx';

  const curlSnippet = `curl -X POST '${tokenUsageUrl}' \\
  -H 'X-Api-Key: ${keyHint}' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "model": "gpt-4o",
    "inputChars": 1500,
    "outputChars": 800
  }'`;

  return (
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* 头部 */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-slate-800">{employee.name}</span>
            <span className="text-xs text-slate-500">{employee.role}</span>
            {employee.paused && (
              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] text-rose-800 ring-1 ring-rose-300">
                ⏸ 暂停
              </span>
            )}
            {!employee.active && !employee.paused && (
              <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">
                停用
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
            {employee.deptSlug && <span>部门 · {employee.deptSlug}</span>}
            <span>日额度 HKD {employee.dailyLimitHkd}</span>
            {apiKey && (
              <span className="font-mono">
                {apiKey.keyPrefix}… · {apiKey.scope}
              </span>
            )}
          </div>
        </div>
        {!apiKey && (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] text-rose-800 ring-1 ring-rose-300">
            ⚠️ 无 ApiKey · 去 /employees 编辑生成
          </span>
        )}
      </div>

      {/* 在 Coze 工作流里要填的内容 */}
      <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
        <div className="mb-1 text-[11px] font-medium text-slate-600">
          在 Coze 工作流加节点时这里要填：
        </div>
        <div className="space-y-1 text-[12px]">
          <KvRow
            k="X-Api-Key (header)"
            v={keyHint}
            hint="老板生成 key 时一次性看到的明文（lty_ 开头）"
          />
          <KvRow k="model (body)" v="跟 LLM 节点选的模型名一致（gpt-4o / claude-sonnet-4-6 / 等）" />
          <KvRow k="inputChars (body)" v="LLM 节点的 Input 文本长度" hint="Coze 表达式：{{prompt 变量}}.length" />
          <KvRow k="outputChars (body)" v="LLM 节点的 Output 文本长度" hint="Coze 表达式：{{output 变量}}.length" />
        </div>
      </div>

      {/* curl 自测 */}
      <details className="border-t border-slate-100">
        <summary className="cursor-pointer px-4 py-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50">
          🧪 用 curl 测一下本 AI 的上报通路（可选）
        </summary>
        <div className="px-4 pb-4">
          <CodeBlock code={curlSnippet} />
          <p className="mt-2 text-[10px] text-slate-500">
            把 <code className="rounded bg-slate-100 px-1">{keyHint}</code> 换成完整的明文 key，运行后应返
            <code className="ml-1 rounded bg-slate-100 px-1">{'{ ok: true, costHkd: ..., paused: false }'}</code>。
            刷新 /overview 几秒后能看到这次估算调用。
          </p>
        </div>
      </details>
    </li>
  );
}

function KvRow({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-800 ring-1 ring-slate-200">
        {k}
      </code>
      <span className="break-all text-slate-700">{v}</span>
      {hint && <span className="text-[10px] text-slate-400">— {hint}</span>}
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-end">
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded bg-slate-200 px-2 py-1 text-[10px] font-medium text-slate-700 transition hover:bg-slate-300"
        >
          {copied ? '✓ 已复制' : '📋 复制'}
        </button>
      </div>
      <pre className="overflow-x-auto rounded bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
        {code}
      </pre>
    </div>
  );
}
