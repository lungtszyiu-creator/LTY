'use client';

/**
 * 单个 AI 员工的接入卡片 — 含 base URL / header / curl 模板 / Coze JSON 模板
 *
 * 每个代码块右上角"复制"按钮，老板点一下复制到剪贴板。
 *
 * 不显示明文 key — 看板只存 hash。老板自己保存的明文应该以这里显示的
 * keyPrefix 开头（如 lty_AbCdE...），方便对照确认是哪把。
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
  lastActiveAt: string | null;
};

type ApiKey = {
  keyPrefix: string;
  scope: string;
  active: boolean;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
};

export function AiSetupCard({
  employee,
  apiKey,
  bridgeUrl,
  dashboardUrl,
}: {
  employee: Employee;
  apiKey: ApiKey | null;
  bridgeUrl: string;
  dashboardUrl: string;
}) {
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic');

  const proxyEndpoint =
    provider === 'anthropic'
      ? `${bridgeUrl}/llm/anthropic/v1/messages`
      : `${bridgeUrl}/llm/openai/v1/chat/completions`;

  const llmKeyPlaceholder = provider === 'anthropic' ? 'sk-ant-xxx' : 'sk-xxx';

  const curlSnippet =
    provider === 'anthropic'
      ? `curl -X POST '${proxyEndpoint}' \\
  -H 'X-Api-Key: ${apiKey?.keyPrefix ?? 'lty_xxx'}<完整看板 key>' \\
  -H 'X-Api-Key: ${llmKeyPlaceholder}<完整 Anthropic key>' \\
  -H 'anthropic-version: 2023-06-01' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 200,
    "messages": [{"role":"user","content":"测试"}]
  }'`
      : `curl -X POST '${proxyEndpoint}' \\
  -H 'X-Api-Key: ${apiKey?.keyPrefix ?? 'lty_xxx'}<完整看板 key>' \\
  -H 'Authorization: Bearer ${llmKeyPlaceholder}<完整 OpenAI key>' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "model": "gpt-5-mini",
    "messages": [{"role":"user","content":"测试"}]
  }'`;

  const cozeJson = JSON.stringify(
    {
      url: proxyEndpoint,
      method: 'POST',
      headers: {
        'X-Api-Key': `${apiKey?.keyPrefix ?? 'lty_xxx'}…`,
        ...(provider === 'anthropic'
          ? {
              // Anthropic 也用 x-api-key — bridge 按前缀区分
              'X-Api-Key (Anthropic)': `${llmKeyPlaceholder}…`,
              'anthropic-version': '2023-06-01',
            }
          : { Authorization: `Bearer ${llmKeyPlaceholder}…` }),
        'Content-Type': 'application/json',
      },
    },
    null,
    2,
  );

  const probeUrl = `${dashboardUrl}/api/v1/me/employee`;

  return (
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* 头部 */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-4 py-3">
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

      {/* 提供商切换 */}
      <div className="flex gap-1 border-b border-slate-100 bg-slate-50 px-3 py-2">
        <button
          type="button"
          onClick={() => setProvider('anthropic')}
          className={`rounded-md px-3 py-1 text-xs font-medium transition ${
            provider === 'anthropic'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Anthropic
        </button>
        <button
          type="button"
          onClick={() => setProvider('openai')}
          className={`rounded-md px-3 py-1 text-xs font-medium transition ${
            provider === 'openai'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          OpenAI
        </button>
      </div>

      {/* 配置内容 */}
      <div className="space-y-3 p-4">
        <ConfigRow
          label="Base URL（替换 AI 工作流原有 LLM endpoint）"
          value={proxyEndpoint}
        />
        <ConfigRow
          label="必填 header 1"
          value={`X-Api-Key: ${apiKey?.keyPrefix ?? 'lty_xxx'}<完整看板 key>`}
          hint="老板自己保存的明文 key（生成时一次性显示），lty_ 开头"
        />
        <ConfigRow
          label={provider === 'anthropic' ? '必填 header 2 (LLM)' : '必填 header 2 (LLM)'}
          value={
            provider === 'anthropic'
              ? `X-Api-Key: ${llmKeyPlaceholder}<完整 Anthropic key> · 或 Authorization: Bearer ${llmKeyPlaceholder}…`
              : `Authorization: Bearer ${llmKeyPlaceholder}<完整 OpenAI key>`
          }
          hint={
            provider === 'anthropic'
              ? 'Anthropic 也用 x-api-key 头 — bridge 按 lty_ vs sk- 前缀区分两把 key'
              : 'OpenAI 标准 Bearer 认证'
          }
        />
        <CodeBlock label="curl 测试模板" code={curlSnippet} />
        <CodeBlock label="Coze plugin 配置参考" code={cozeJson} />

        {/* 探活按钮 */}
        <div className="flex flex-wrap items-baseline gap-2 border-t border-slate-100 pt-3">
          <span className="text-[11px] text-slate-500">
            探活看板：用本 AI 的 X-Api-Key 调
          </span>
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
            GET {probeUrl}
          </code>
          <span className="text-[11px] text-slate-500">— 应返该 AI 员工档案 + 今日已花</span>
        </div>
      </div>
    </li>
  );
}

function ConfigRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="mb-0.5 text-[11px] font-medium text-slate-600">{label}</div>
      <div className="flex items-start gap-2">
        <div className="flex-1 break-all rounded bg-slate-100 px-2 py-1.5 font-mono text-[11px] text-slate-800">
          {value}
        </div>
        <CopyBtn text={value} />
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-slate-500">{hint}</div>}
    </div>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between">
        <span className="text-[11px] font-medium text-slate-600">{label}</span>
        <CopyBtn text={code} />
      </div>
      <pre className="overflow-x-auto rounded bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
        {code}
      </pre>
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="shrink-0 rounded bg-slate-200 px-2 py-1 text-[10px] font-medium text-slate-700 transition hover:bg-slate-300"
    >
      {copied ? '✓ 已复制' : '📋 复制'}
    </button>
  );
}
