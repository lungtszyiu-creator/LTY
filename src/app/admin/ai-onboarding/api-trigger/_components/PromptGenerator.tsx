'use client';

/**
 * Prompt 生成器 — 选 AI 员工 + 触发方式 → 输出"填好空的 prompt + 模板代码"
 *
 * 三段输出：
 *   1. 给 AI 助手的 prompt（包含 LTY 项目上下文 + 同事的具体 AI 员工信息）
 *   2. 触发方式预设代码（4 选 1: TG bot / 看板按钮 / Vercel cron / webhook）
 *   3. 把 inputs 转成可直接发给同事的"一句话 SOP"
 *
 * 同事拿这段 prompt 给 Claude/ChatGPT/Coze bot，AI 一步步带做接入。
 */
import { useState, useMemo } from 'react';

type Employee = {
  id: string;
  name: string;
  role: string;
  deptSlug: string | null;
  deptName: string | null;
  keyPrefix: string | null;
  scope: string | null;
};

type DeptOption = { slug: string; name: string };

type TriggerKind = 'tg-bot' | 'dashboard-button' | 'vercel-cron' | 'webhook';

const TRIGGER_LABELS: Record<TriggerKind, { title: string; tag: string; hint: string }> = {
  'tg-bot': {
    title: 'A · Telegram bot @ 触发',
    tag: 'TG',
    hint: '同事在群里 @bot 发指令 → AI 自动响应。仿老板 finance_bridge 模式（FastAPI on Mac via Tailscale Funnel）',
  },
  'dashboard-button': {
    title: 'B · 看板按钮触发',
    tag: '看板',
    hint: '看板某页加「运行 X」按钮 → 看板 server 调 Coze API → 结果显示在看板。完全在线（Vercel）',
  },
  'vercel-cron': {
    title: 'C · Vercel cron 定时触发',
    tag: 'Cron',
    hint: '固定时间自动跑（例：每天 9 点跑日报、每月 1 号跑月报）。无需用户操作',
  },
  webhook: {
    title: 'D · 通用 webhook 触发',
    tag: 'Webhook',
    hint: '第三方系统（飞书 / Slack / GitHub / etc）→ POST 看板 endpoint → 调 Coze API。最灵活',
  },
};

export function PromptGenerator({
  employees,
  depts,
  dashboardUrl,
}: {
  employees: Employee[];
  depts: DeptOption[];
  dashboardUrl: string;
}) {
  const [employeeId, setEmployeeId] = useState<string>(employees[0]?.id ?? '');
  const [triggerKind, setTriggerKind] = useState<TriggerKind>('dashboard-button');

  const employee = employees.find((e) => e.id === employeeId) ?? employees[0];

  // 生成 prompt 文本
  const prompt = useMemo(() => buildPrompt(employee, triggerKind, dashboardUrl), [
    employee,
    triggerKind,
    dashboardUrl,
  ]);

  // 生成触发模板代码
  const code = useMemo(() => buildCode(employee, triggerKind), [employee, triggerKind]);

  // 生成发同事的"一句话 SOP"
  const sopMessage = useMemo(() => buildSopMessage(employee, dashboardUrl), [employee, dashboardUrl]);

  if (employees.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-6 py-8 text-center text-sm text-slate-500">
        还没建过 AI 员工档案。先去 <a href="/employees" className="text-violet-800 hover:underline">/employees</a> 建一个 + 生成 ApiKey。
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 选项区 */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          ① 选 AI 员工 + 触发方式
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="AI 员工">
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className={inputCls}
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.role}
                  {e.deptName && ` · ${e.deptName}`}
                </option>
              ))}
            </select>
            {employee?.keyPrefix && (
              <span className="mt-1 block text-[11px] text-slate-500">
                key 前缀：<code className="rounded bg-slate-100 px-1 font-mono">{employee.keyPrefix}…</code>
                {' '}（明文你自己保存的；忘了去 /employees 编辑 → 🔄 重新生成 Key）
              </span>
            )}
          </Field>

          <Field label="触发方式">
            <select
              value={triggerKind}
              onChange={(e) => setTriggerKind(e.target.value as TriggerKind)}
              className={inputCls}
            >
              {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.title}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-slate-500">
              {TRIGGER_LABELS[triggerKind].hint}
            </span>
          </Field>
        </div>
      </section>

      {/* 输出 1: 一句话 SOP */}
      <section className="rounded-xl border border-amber-300 bg-amber-100/40 p-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-900">
            ② 一句话 SOP — 直接发给同事
          </h2>
          <CopyBtn text={sopMessage} />
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-white p-3 font-mono text-[11px] leading-relaxed text-slate-800">
          {sopMessage}
        </pre>
      </section>

      {/* 输出 2: prompt */}
      <section className="rounded-xl border border-violet-300 bg-violet-100/30 p-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-900">
              ③ 给 AI 助手的 prompt — 同事整段粘贴给 Claude / ChatGPT
            </h2>
            <p className="mt-0.5 text-[11px] text-violet-800">
              已自动填好部门 / 员工 keyPrefix / 看板 URL，同事只需补 4 个 ___FILL_ME___（workflow_id / input 字段名 / 完整明文 key / Coze PAT）
            </p>
          </div>
          <CopyBtn text={prompt} />
        </div>
        <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap break-words rounded bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
          {prompt}
        </pre>
      </section>

      {/* 输出 3: 触发代码模板 */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              ④ 触发模板代码 ·{' '}
              <span className="text-violet-800">{TRIGGER_LABELS[triggerKind].title}</span>
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">{code.lang} · {code.note}</p>
          </div>
          <CopyBtn text={code.body} />
        </div>
        <pre className="max-h-[500px] overflow-auto rounded bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
          {code.body}
        </pre>
      </section>

      {/* checklist */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          完成 checklist
        </h2>
        <ul className="space-y-1.5 text-sm text-slate-700">
          <li>☐ 在看板 <a href="/employees" className="text-violet-800 hover:underline">/employees</a> 建好 AI 员工档案 + 拿 lty_xxx 完整明文 key（保存到密码管家）</li>
          <li>☐ 在 Coze workspace publish 工作流，记下 workflow_id（编辑器 URL 末段）</li>
          <li>☐ 在 Coze 拿 PAT（coze.com → 头像 → API → Personal Access Tokens → 勾 workflow.run scope）</li>
          <li>☐ 复制上面 ③ 整段 prompt → 粘贴给 AI 助手 → 按 AI 指引部署触发器</li>
          <li>☐ Coze 工作流大模型节点输出后加 `LTY_Token_Report.reportTokenUsage` plugin 节点（4 字段：X-Api-Key 用你的 lty_xxx，model 用大模型节点选的模型名，inputChars/outputChars 先 100/50）</li>
          <li>☐ 触发一次工作流测试 → 看板 <a href="/dept/ai" className="text-violet-800 hover:underline">/dept/ai</a> 应该出现你的 AI + token 数据</li>
        </ul>
      </section>
    </div>
  );
}

// ============ 模板生成 ============

function buildPrompt(employee: Employee | undefined, kind: TriggerKind, dashboardUrl: string): string {
  if (!employee) return '';
  const triggerName = TRIGGER_LABELS[kind].title;
  const deptDesc = employee.deptName ?? '（跨部门）';
  return `我在 LTY 旭珑公司 ${deptDesc} 工作，负责 AI 员工「${employee.name}」（角色：${employee.role}）。我要把这个 AI 的 Coze 工作流改成 ${triggerName} 模式，让 LLM 调用从烧 Coze Credit (400/月套餐) 切换到烧 Coze tokens (OpenAI 原价透传，不抽成)。**步骤详细到可以一行行复制执行**。

# LTY 项目背景（事实，不要问我）
- Coze workspace 名: LTY Group
- 看板 base URL: ${dashboardUrl}
- 看板 token 监控接入页: ${dashboardUrl}/admin/ai-onboarding
- 看板 workspace 共享 plugin: LTY_Token_Report (老板昨晚已 Publish)
- 看板 endpoint: POST /api/v1/token-usage (header X-Api-Key, body 含 model + inputChars + outputChars)

# 我的 AI 员工资源
- 员工名: ${employee.name}
- 角色: ${employee.role}
- 部门: ${deptDesc}${employee.deptSlug ? ` (slug: ${employee.deptSlug})` : ''}
- 看板 ApiKey 前缀: ${employee.keyPrefix ?? '（还没生成，先去 /employees 编辑这个员工生成 key）'}
- ApiKey scope: ${employee.scope ?? 'AI_EMPLOYEE:default'}

# 我会自己填进来
- 我的 workflow_id: ___FILL_ME___ (从 Coze workflow 编辑页 URL 末段拿数字串)
- 工作流 input 字段名: ___FILL_ME___ (Start 节点的 output 字段名，常见: user_message / query / input)
- 我的完整明文 lty_ key: ___FILL_ME___ (前缀是 ${employee.keyPrefix ?? 'lty_xxx'}…，自己保存的明文)
- 我的 Coze PAT: ___FILL_ME___ (coze.com → 头像 → API → Personal Access Tokens → 新建 → 至少勾 workflow.run scope)

# 触发方式选择
${triggerName}
${TRIGGER_LABELS[kind].hint}

# 帮我做这 4 件事（顺序执行，不要跳）

1. **给我可执行代码**（${triggerName} 完整模板，按我填的 4 个 FILL_ME 替换占位符）
2. **写出 Coze API 调用代码**（Python httpx 或 Node.js fetch 都行）：
   POST https://api.coze.com/v1/workflow/run
   Authorization: Bearer <我的 PAT>
   Content-Type: application/json
   { "workflow_id": "<我的 workflow_id>", "parameters": { "<input 字段名>": "<用户输入>" } }
3. **告诉我怎么部署**这段触发器代码（Vercel route / Mac launchd / GitHub Action / etc 按 ${triggerName} 的特性给具体步骤）
4. **接 token 监控的提醒**：在我 Coze 工作流大模型节点输出后加 LTY_Token_Report.reportTokenUsage plugin 节点（workspace 共享版搜得到），4 字段填：
   - X-Api-Key: 我的 ${employee.keyPrefix ?? 'lty_xxx'}… 完整明文
   - model: 跟大模型节点选的模型名一致 (gpt-4o / gemini-2.0-flash / claude-sonnet-4-6)
   - inputChars: 100 (先固定值)
   - outputChars: 50 (先固定值)

# 不用问我的事
- Coze 价格 (透传 OpenAI 原价不抽成，老板昨晚确认)
- 看板架构 (Next.js + Prisma + Vercel)

直接给步骤 + 代码 + 部署指南。`;
}

function buildSopMessage(employee: Employee | undefined, dashboardUrl: string): string {
  if (!employee) return '';
  return `Hi，按这 6 步把你部门 AI（${employee.name}）接进 token 监控:
1. 看板 ${dashboardUrl}/employees → 找「${employee.name}」→ 编辑 → 🔄 重新生成 Key（如果你没保存明文）→ 复制保存
2. 看板 ${dashboardUrl}/admin/ai-onboarding/api-trigger → 选你的员工 + 触发方式 → 复制 ③ 那段 prompt
3. 把 prompt 粘贴给 Claude/ChatGPT，AI 会一步步教你部署触发器代码
4. 在 Coze workspace 的工作流大模型节点输出后加 LTY_Token_Report.reportTokenUsage plugin 节点，X-Api-Key 用你保存的明文 key
5. publish 工作流 + Test run 一次
6. 看板 ${dashboardUrl}/dept/ai 看到你的 AI 出现 = ✅ 完工

卡住就把错误截图发群里。`;
}

function buildCode(
  employee: Employee | undefined,
  kind: TriggerKind,
): { lang: string; note: string; body: string } {
  const empName = employee?.name ?? 'AI Employee';
  const deptSlug = employee?.deptSlug ?? 'your-dept';
  const keyPrefix = employee?.keyPrefix ?? 'lty_xxx';

  switch (kind) {
    case 'tg-bot':
      return {
        lang: 'Python (FastAPI)',
        note: '部署在 Mac/服务器，配 Tailscale Funnel 公网入口；模式参考老板 _meta/finance_bridge/bridge.py',
        body: `# ${deptSlug}_bot.py — ${empName} TG 触发器
# 部署: caffeinate -i python3 ${deptSlug}_bot.py (Mac 防睡眠)
import os
import httpx
from fastapi import FastAPI, Header, HTTPException, Request

app = FastAPI()
COZE_API = "https://api.coze.com/v1/workflow/run"
TG_API = "https://api.telegram.org"

# ====== 配置（用 env 或 .env 文件，不要硬编码 ======
COZE_PAT = os.environ["COZE_PAT"]              # Coze 个人 PAT
WORKFLOW_ID = "___FILL_ME_WORKFLOW_ID___"      # Coze workflow 编辑页 URL 末段
INPUT_PARAM = "user_message"                   # 工作流 Start 节点输出字段名 (改成你的)
TG_BOT_TOKEN = os.environ["TG_BOT_TOKEN"]      # @BotFather 拿
TG_WEBHOOK_SECRET = os.environ["TG_WEBHOOK_SECRET"]  # python3 -c 'import secrets;print(secrets.token_hex(32))'
ALLOWED_USER_IDS = [123456789]                 # @userinfobot 拿

@app.post("/tg/webhook")
async def tg_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str | None = Header(None),
):
    # 1) 校验 secret
    if x_telegram_bot_api_secret_token != TG_WEBHOOK_SECRET:
        raise HTTPException(401, "bad secret")

    update = await request.json()
    msg = update.get("message") or update.get("edited_message") or {}
    text = msg.get("text", "")
    chat_id = msg.get("chat", {}).get("id")
    user_id = msg.get("from", {}).get("id")

    # 2) 只接受白名单用户
    if user_id not in ALLOWED_USER_IDS:
        return {"ok": True, "skipped": "not_in_whitelist"}

    # 3) 调 Coze workflow
    async with httpx.AsyncClient(timeout=300.0) as client:
        coze_resp = await client.post(
            COZE_API,
            headers={"Authorization": f"Bearer {COZE_PAT}", "Content-Type": "application/json"},
            json={
                "workflow_id": WORKFLOW_ID,
                "parameters": {INPUT_PARAM: text},
            },
        )
        coze_resp.raise_for_status()
        data = coze_resp.json().get("data", "")

        # 4) 把结果发回 TG
        await client.post(
            f"{TG_API}/bot{TG_BOT_TOKEN}/sendMessage",
            json={"chat_id": chat_id, "text": data, "parse_mode": "HTML"},
        )

    return {"ok": True}


@app.get("/healthz")
def healthz():
    return {"ok": True, "workflow_id": WORKFLOW_ID}


# ====== 启动 ======
# 1) Tailscale Funnel 暴露公网: tailscale funnel 8080
# 2) TG setWebhook: curl -F "url=https://<host>.<tail>.ts.net/tg/webhook" -F "secret_token=<TG_WEBHOOK_SECRET>" "https://api.telegram.org/bot$TG_BOT_TOKEN/setWebhook"
# 3) 跑: caffeinate -i uvicorn ${deptSlug}_bot:app --host 0.0.0.0 --port 8080
`,
      };

    case 'dashboard-button':
      return {
        lang: 'TypeScript (Next.js Route Handler)',
        note: '在看板 lungtszyiu-creator/LTY 仓库加文件 + Vercel env 配 COZE_PAT，不用 Mac 跑服务',
        body: `// src/app/api/dept/${deptSlug}/run-ai/route.ts
//
// 部署: 提 PR 到看板 lungtszyiu-creator/LTY，merge 后 Vercel 自动部署。
// Vercel env 加: COZE_PAT (Coze 个人 PAT)
//
// 前端按钮调用:
//   await fetch('/api/dept/${deptSlug}/run-ai', { method: 'POST', body: JSON.stringify({ input: '用户输入' }) })

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDeptEdit } from '@/lib/dept-access';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Coze workflow 可能跑 30-60s

const COZE_API = 'https://api.coze.com/v1/workflow/run';
const WORKFLOW_ID = '___FILL_ME_WORKFLOW_ID___'; // Coze workflow 编辑页 URL 末段
const INPUT_PARAM = 'user_message';              // Start 节点输出字段名 (改成你的)

const reqSchema = z.object({
  input: z.string().min(1).max(4000),
});

export async function POST(req: NextRequest) {
  // 校验调用人是该部门 LEAD/SUPER_ADMIN
  const ctx = await requireDeptEdit('${deptSlug}');
  if (ctx instanceof NextResponse) return ctx;

  const data = reqSchema.parse(await req.json());

  const cozeResp = await fetch(COZE_API, {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${process.env.COZE_PAT}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      workflow_id: WORKFLOW_ID,
      parameters: { [INPUT_PARAM]: data.input },
    }),
  });

  if (!cozeResp.ok) {
    const text = await cozeResp.text();
    return NextResponse.json(
      { error: 'COZE_FAIL', status: cozeResp.status, detail: text },
      { status: 502 },
    );
  }

  const result = await cozeResp.json();
  return NextResponse.json({ ok: true, output: result.data, debugUrl: result.debug_url });
}
`,
      };

    case 'vercel-cron':
      return {
        lang: 'TypeScript (Next.js) + vercel.json',
        note: '加文件到看板 LTY repo + 改 vercel.json，Vercel 自动按 cron 跑（Hobby plan 每天最多 2 个 cron）',
        body: `// 文件 1: vercel.json (合并到看板根目录已有的 vercel.json)
{
  "crons": [
    {
      "path": "/api/cron/${deptSlug}-daily",
      "schedule": "0 1 * * *"
    }
  ]
}

// 文件 2: src/app/api/cron/${deptSlug}-daily/route.ts
//
// Vercel 每天 09:00 HK (UTC 01:00) 自动触发；可改 schedule 字符串
// schedule 是标准 cron 格式: "分 时 日 月 周"，UTC 时区
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COZE_API = 'https://api.coze.com/v1/workflow/run';
const WORKFLOW_ID = '___FILL_ME_WORKFLOW_ID___';
const INPUT_PARAM = 'user_message';

export async function GET() {
  // Vercel cron 默认 GET，可加 Authorization: Bearer <CRON_SECRET> 防伪
  const cozeResp = await fetch(COZE_API, {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${process.env.COZE_PAT}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      workflow_id: WORKFLOW_ID,
      parameters: {
        [INPUT_PARAM]: '请生成今日 ${empName} 日报',
      },
    }),
  });

  if (!cozeResp.ok) {
    return NextResponse.json({ error: 'COZE_FAIL' }, { status: 502 });
  }
  const result = await cozeResp.json();

  // 这里可以把 result.data 写到看板 DB / 推 TG / 归档 vault
  // 例：await prisma.report.create({ data: { content: result.data, ... } });

  return NextResponse.json({ ok: true, output: result.data });
}
`,
      };

    case 'webhook':
      return {
        lang: 'TypeScript (Next.js Route Handler)',
        note: '通用 webhook，校验 X-Webhook-Secret header 防伪。第三方系统配 webhook URL 指向这个 endpoint',
        body: `// src/app/api/webhook/${deptSlug}/route.ts
//
// 通用 webhook 触发器。
// Vercel env 加:
//   COZE_PAT       (Coze 个人 PAT)
//   WEBHOOK_SECRET (调用方要带 X-Webhook-Secret header)
//
// 第三方系统（飞书 / Slack / GitHub / 等）配 webhook 时:
//   URL: https://lty-nu.vercel.app/api/webhook/${deptSlug}
//   Method: POST
//   Header: X-Webhook-Secret: <WEBHOOK_SECRET>
//   Body: { "input": "..." }

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COZE_API = 'https://api.coze.com/v1/workflow/run';
const WORKFLOW_ID = '___FILL_ME_WORKFLOW_ID___';
const INPUT_PARAM = 'user_message';

export async function POST(req: NextRequest) {
  // 1) 校验 secret
  const secret = req.headers.get('x-webhook-secret');
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  // 2) 解析 body
  const body = await req.json().catch(() => ({}));
  const input = body.input ?? body.text ?? body.message ?? '';
  if (!input) {
    return NextResponse.json({ error: 'NO_INPUT' }, { status: 400 });
  }

  // 3) 调 Coze
  const cozeResp = await fetch(COZE_API, {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${process.env.COZE_PAT}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      workflow_id: WORKFLOW_ID,
      parameters: { [INPUT_PARAM]: input },
    }),
  });

  if (!cozeResp.ok) {
    return NextResponse.json({ error: 'COZE_FAIL' }, { status: 502 });
  }
  const result = await cozeResp.json();

  return NextResponse.json({ ok: true, output: result.data });
}
`,
      };
  }
}

// ============ 通用 ============

const inputCls =
  'mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-violet-500 focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-slate-700">{label}</span>
      {children}
    </label>
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
      className="shrink-0 rounded bg-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-300"
    >
      {copied ? '✓ 已复制' : '📋 复制'}
    </button>
  );
}
