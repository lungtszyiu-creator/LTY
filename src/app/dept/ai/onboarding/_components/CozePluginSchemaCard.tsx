'use client';

/**
 * 步骤 ① — 一次性建 Coze plugin 的 OpenAPI schema 卡片
 *
 * 老板在 Coze 后台 → 个人空间/团队空间 → Plugins → 新建 plugin（OpenAPI 模式）
 * → 把这里的 schema 整段复制粘贴 → 保存。完事后所有 AI 工作流都能用这个 plugin。
 */
import { useState } from 'react';

export function CozePluginSchemaCard({ tokenUsageUrl }: { tokenUsageUrl: string }) {
  const url = new URL(tokenUsageUrl);
  const baseUrl = `${url.protocol}//${url.host}`;
  const path = url.pathname;

  // OpenAPI 3.x schema — Coze plugin 标准格式
  const openApiSchema = JSON.stringify(
    {
      openapi: '3.0.1',
      info: {
        title: 'LTY Dashboard Token Report',
        description: '上报 AI 调用 LLM 的 token 用量到 LTY 看板，用于成本统计 + 撞顶暂停',
        version: '1.0.0',
      },
      servers: [{ url: baseUrl }],
      paths: {
        [path]: {
          post: {
            summary: 'Report token usage',
            description:
              'AI 工作流的大模型节点跑完后调本接口上报。看板会自动按 X-Api-Key 反查员工，估算 HKD 成本。',
            operationId: 'reportTokenUsage',
            parameters: [
              {
                name: 'X-Api-Key',
                in: 'header',
                required: true,
                description: '本 AI 员工的看板 key (lty_xxx)',
                schema: { type: 'string' },
              },
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['model'],
                    properties: {
                      model: {
                        type: 'string',
                        description: 'LLM 模型名，如 gpt-4o / claude-sonnet-4-6 / gemini-2.0-flash',
                      },
                      inputChars: {
                        type: 'integer',
                        description: 'Prompt（输入）字符数。看板会 ÷3 估 token。',
                      },
                      outputChars: {
                        type: 'integer',
                        description: 'Response（输出）字符数。看板会 ÷3 估 token。',
                      },
                    },
                  },
                },
              },
            },
            responses: {
              '200': {
                description: '上报成功',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        ok: { type: 'boolean' },
                        costHkd: { type: 'number' },
                        dailyUsedHkd: { type: 'number' },
                        paused: { type: 'boolean' },
                      },
                    },
                  },
                },
              },
              '401': { description: 'X-Api-Key 无效或缺失' },
              '429': { description: '员工已撞顶 paused，需老板解锁' },
            },
          },
        },
      },
    },
    null,
    2,
  );

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">
          步骤 ① · 一次建好的共享 plugin（OpenAPI schema）
        </h2>
        <p className="mt-1 text-[11px] text-slate-500">
          在 Coze 后台 → Plugins → 新建（OpenAPI 模式）→ 整段粘贴下面 JSON → 保存。所有 AI 工作流都能复用。
        </p>
      </div>
      <div className="p-4">
        <CodeBlock label="OpenAPI 3.0 schema（整段复制粘贴到 Coze）" code={openApiSchema} />
      </div>
    </section>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-medium text-slate-600">{label}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded bg-slate-200 px-2 py-1 text-[10px] font-medium text-slate-700 transition hover:bg-slate-300"
        >
          {copied ? '✓ 已复制' : '📋 复制全部'}
        </button>
      </div>
      <pre className="max-h-72 overflow-auto rounded bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
        {code}
      </pre>
    </div>
  );
}
