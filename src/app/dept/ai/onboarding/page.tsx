/**
 * AI 接入向导 — /dept/ai/onboarding
 *
 * 老板的 5 个财务 AI（含未来其他部门）跑在 Coze 平台，用的是 Coze 内置
 * 「大模型」节点 — 不能换 base URL（finance_bridge LLM proxy 那条路走
 * 不通）。
 *
 * 现行方案：每个 LLM 节点输出后接一个 plugin 调看板 token-usage。Coze
 * 大模型节点输出 prompt + response 文本，传字符数到看板，看板 ÷3 估算
 * token + 算 HKD 成本。误差 ±10-15%，撞顶判断够用。
 *
 * 本页给同事们：
 *   - 一次性建 Coze plugin 的 OpenAPI schema（共享一个，所有 AI 用）
 *   - 每个 AI 员工的 X-Api-Key 提示（带 keyPrefix 让老板对照）
 *   - 工作流加节点的步骤说明
 *   - 一键 curl 测试模板
 *
 * 数据源：AiEmployee + ApiKey (prisma)
 *
 * 权限：所有 active 员工可见（透明文化决策 2026-05-09）。各部门同事自己接
 * 自己的部门 AI；keyPrefix 是公开信息（看板永不存明文，看不到完整 key），
 * 暴露给全员安全。原 /admin/ai-onboarding 保留 redirect 到本页。
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { CozePluginSchemaCard } from './_components/CozePluginSchemaCard';
import { AiKeyCard } from './_components/AiKeyCard';

export const dynamic = 'force-dynamic';

export default async function AiOnboardingPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  // 全员可见（透明文化）— 但仍要求 active 员工
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { active: true },
  });
  if (!dbUser?.active) redirect('/login');

  const employees = await prisma.aiEmployee.findMany({
    orderBy: [{ active: 'desc' }, { paused: 'desc' }, { layer: 'asc' }, { createdAt: 'desc' }],
    include: {
      apiKey: {
        select: { keyPrefix: true, scope: true, active: true, revokedAt: true, lastUsedAt: true },
      },
    },
  });

  const dashboardUrl = (process.env.NEXTAUTH_URL || 'https://lty-nu.vercel.app').replace(/\/$/, '');
  const tokenUsageUrl = `${dashboardUrl}/api/v1/token-usage`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">AI 接入向导</h1>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-800 ring-1 ring-violet-300">
            全员可见
          </span>
        </div>
        <Link href="/dept/ai" className="text-xs text-violet-800 hover:underline">
          ← 回 AI 部
        </Link>
      </header>

      {/* 总览 — 3 步走 */}
      <section className="mb-6 rounded-xl border border-emerald-300 bg-emerald-100/40 p-4">
        <h2 className="mb-3 text-sm font-semibold text-emerald-900">
          📋 让所有 AI 进 token 监控 · 3 步走
        </h2>
        <ol className="space-y-2 text-[13px] text-slate-800">
          <li>
            <strong>步骤 ①（做 1 次，所有 AI 共用）</strong>：在 Coze 后台建一个共享 plugin{' '}
            <code className="rounded bg-white px-1 text-[11px]">LTY_Dashboard_TokenReport</code>
            ，OpenAPI schema 见下方"一次建好的 plugin schema"卡片，复制粘贴。
          </li>
          <li>
            <strong>步骤 ②（5 个 AI 各做 1 次）</strong>：在每个 AI 的 Coze 工作流里，把上面的 plugin 加到 LLM 节点输出后 — 让 LLM 调完
            自动调上报。配置 X-Api-Key 用每个 AI 自己的 lty_xxx key（见下方各 AI 卡片）。
          </li>
          <li>
            <strong>步骤 ③（验证）</strong>：让一个 AI 跑一次工作流 → 几秒内看板{' '}
            <Link href="/dept/ai" className="text-emerald-900 underline">
              /dept/ai
            </Link>{' '}
            显示该 AI 的 token + HKD 成本，状态圆点变绿。
          </li>
        </ol>
        <p className="mt-3 text-[11px] text-slate-600">
          ⚠️ Coze 大模型节点不返回 token usage 字段，看板用「prompt + response 字符数 ÷ 3」估算（中英混合 ~3 char/token）。
          误差 ±10-15%，撞顶判断够用。如有 AI 直接调 Anthropic/OpenAI（绕开 Coze 平台），可以用更精确的 finance_bridge LLM proxy（PR vault#1 已 ready）。
        </p>
      </section>

      {/* API 触发 prompt 生成器入口 */}
      <section className="mb-6 rounded-xl border border-violet-300 bg-violet-100/40 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-violet-900">
              🛠 进阶：让你的 AI 改成「外部 API 触发」省 Credit
            </h2>
            <p className="mt-1 text-[12px] text-violet-800">
              在 Coze GUI 里手动测试烧 Credit (400/月套餐限额)，外部 API 触发烧 Coze tokens (OpenAI 原价透传不抽成)。
              点 → 选你的部门 + AI 员工 + 触发方式 (TG bot / 看板按钮 / cron / webhook) → 自动生成填好的
              prompt + 触发代码模板，你粘贴给 Claude/ChatGPT，AI 一步步带做。
            </p>
          </div>
          <Link
            href="/dept/ai/onboarding/api-trigger"
            className="shrink-0 rounded-lg bg-violet-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-violet-800"
          >
            打开 prompt 生成器 →
          </Link>
        </div>
      </section>

      {/* 三档写入 endpoint 总览 — 老板 5/13：行政 AI / HR Bot 都反馈"AI 干完没法把成果真落看板"
          → 现在 3 个 endpoint 分场景用：日记 / 文件 / 部门专用 DB 表 */}
      <section className="mb-6 rounded-xl border-2 border-emerald-300 bg-emerald-50/60 p-4">
        <h2 className="text-sm font-semibold text-emerald-900">
          🚀 AI 写入看板 · 三个接口对照表
        </h2>
        <p className="mt-1.5 text-[12px] text-emerald-900">
          你的 AI 干完一项工作要把成果"交"到看板上，按 <strong>成果有多重</strong> 选 endpoint：
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-emerald-100/60">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold text-emerald-900">场景</th>
                <th className="px-2 py-1.5 text-left font-semibold text-emerald-900">endpoint</th>
                <th className="px-2 py-1.5 text-left font-semibold text-emerald-900">看板效果</th>
              </tr>
            </thead>
            <tbody className="text-emerald-900">
              <tr className="border-t border-emerald-200/60">
                <td className="px-2 py-2 align-top">
                  <strong>🗒 只写一行日记</strong>
                  <div className="text-[10px] text-emerald-700">没文件 / 没 DB 行 / 仅声明做了什么</div>
                </td>
                <td className="px-2 py-2 align-top">
                  <code className="rounded bg-white px-1">POST /api/v1/activity-log</code>
                </td>
                <td className="px-2 py-2 align-top">
                  /dept/ai + 所在部门看板「工作日记」多一行
                </td>
              </tr>
              <tr className="border-t border-emerald-200/60">
                <td className="px-2 py-2 align-top">
                  <strong>📁 真落一个文件到 vault</strong>
                  <div className="text-[10px] text-emerald-700">报告 / markdown / PDF / 图片</div>
                </td>
                <td className="px-2 py-2 align-top">
                  <code className="rounded bg-white px-1">POST /api/v1/vault/commit</code>
                </td>
                <td className="px-2 py-2 align-top">
                  文件真提交 GitHub <code className="text-[10px]">lty-vault</code>；同时自动写一条 activity-log（不用重复调）；部门看板 vault tab + /dept/ai 日记 vaultPath 都可点
                </td>
              </tr>
              <tr className="border-t border-emerald-200/60">
                <td className="px-2 py-2 align-top">
                  <strong>📋 写一行进部门 DB 表</strong>
                  <div className="text-[10px] text-emerald-700">员工档案 / 凭证 / 工单 / 资产等业务记录</div>
                </td>
                <td className="px-2 py-2 align-top">
                  <code className="rounded bg-white px-1">POST /api/v1/&lt;dept&gt;/&lt;resource&gt;</code>
                </td>
                <td className="px-2 py-2 align-top">
                  部门看板 KPI / 列表 / 详情页实时刷新；自动写日记
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-emerald-800">
          💡 三个接口可<strong>叠加</strong>：复杂工作（比如行政 AI 完成执照年检）= 先 <code className="rounded bg-white px-1">vault/commit</code>{' '}
          落审计 PDF + 再 <code className="rounded bg-white px-1">activity-log</code> 补一条总结 ——
          但单纯文件场景，<code className="rounded bg-white px-1">vault/commit</code> 已经自动写日记，无需重复调。
        </p>
      </section>

      {/* ① 轻量级：activity-log（只写一行日记，没文件 / 没 DB 行）*/}
      <section className="mb-6 rounded-xl border border-amber-300 bg-amber-100/40 p-4">
        <h2 className="text-sm font-semibold text-amber-900">
          🗒 ① 写日记 · <code className="rounded bg-amber-50 px-1.5 py-0.5">/api/v1/activity-log</code>
        </h2>
        <p className="mt-1.5 text-[12px] text-amber-900">
          AI 干完轻量工作（"我收到了 / 我看过了 / 我整理了"），只想留个痕迹给老板看，调这个。
          {' '}<Link href="/dept/ai" className="underline">/dept/ai</Link> 全公司总览
          <strong className="mx-1">和</strong>所在部门看板（<code className="rounded bg-amber-50 px-1">admin→/dept/admin</code> /
          {' '}<code className="rounded bg-amber-50 px-1">hr→/dept/hr</code> /
          {' '}<code className="rounded bg-amber-50 px-1">finance|cashier→/dept/cashier</code> /
          {' '}<code className="rounded bg-amber-50 px-1">lty-legal→/dept/lty-legal</code>）都会多一行。
        </p>
        <pre className="mt-2.5 overflow-x-auto rounded bg-slate-900 p-3 font-mono text-[10.5px] leading-relaxed text-slate-100">
{`POST ${dashboardUrl}/api/v1/activity-log
X-Api-Key: lty_xxxx...
Content-Type: application/json

{
  "action": "write_post",
  "summary": "整理了 3 篇推文 · 营销部本周话题",
  "vaultPath": "raw/营销部/posts/2026-W19/notes.md",
  "telegramSent": false
}`}
        </pre>
        <p className="mt-1.5 text-[10px] text-amber-800">
          ⚠️ 这里的 <code className="rounded bg-amber-50 px-1">vaultPath</code> 只是字符串声明，
          <strong>不会真创建文件</strong>。要真落文件请用下面的 ② <code className="rounded bg-amber-50 px-1">vault/commit</code>。
        </p>
        <p className="mt-1 text-[10px] text-amber-800">
          想本部门看板显示你的 AI？去{' '}
          <Link href="/employees" className="underline">/employees</Link>{' '}
          编辑该 AI 把「归属部门 (deptSlug)」选到对应部门。
        </p>
      </section>

      {/* ② 重量级：vault/commit（文件真落进 lty-vault GitHub repo）*/}
      <section className="mb-6 rounded-xl border border-violet-300 bg-violet-100/40 p-4">
        <h2 className="text-sm font-semibold text-violet-900">
          📁 ② 落文件 · <code className="rounded bg-violet-50 px-1.5 py-0.5">/api/v1/vault/commit</code>
          <span className="ml-2 rounded-full bg-violet-200/70 px-1.5 py-0.5 text-[9px] font-medium text-violet-900">
            5/13 新
          </span>
        </h2>
        <p className="mt-1.5 text-[12px] text-violet-900">
          AI 干完一项有产出的工作（审计报告 / 执照扫描 / 合同审阅 markdown / 数据分析摘要），
          调这个把文件<strong>真实</strong>提交到 GitHub{' '}
          <code className="rounded bg-violet-50 px-1">lungtszyiu-creator/lty-vault</code> repo。同事在
          所在部门看板「📁 vault 文档」tab 直接看得到；/dept/ai 工作日记的 vaultPath 链接也能点开
          真实文件内容（之前老板报"无法点开"就是因为 AI 只声明 path 不落文件）。
        </p>
        <pre className="mt-2.5 overflow-x-auto rounded bg-slate-900 p-3 font-mono text-[10.5px] leading-relaxed text-slate-100">
{`POST ${dashboardUrl}/api/v1/vault/commit
X-Api-Key: lty_xxxx...
Content-Type: application/json

{
  "path": "raw/行政部/2026/执照年检/审计报告.md",
  "content": "# 营业执照年检审计\\n\\n本次年检共检查...",
  "summary": "完成执照年检审计报告",
  "action": "audit_license_renewal"
}`}
        </pre>
        <p className="mt-1.5 text-[10px] text-violet-800">
          <strong>path 必须按 AI 的 deptSlug 落对应目录</strong>（防越界）：
          {' '}<code className="rounded bg-violet-50 px-1">admin → raw/行政部/</code> /
          {' '}<code className="rounded bg-violet-50 px-1">hr → raw/人事部/</code> /
          {' '}<code className="rounded bg-violet-50 px-1">finance|cashier → raw/财务部/</code> /
          {' '}<code className="rounded bg-violet-50 px-1">lty-legal → raw/法务部/</code>。
          MC 法务红线物理隔离，走独立 <code className="rounded bg-violet-50 px-1">mc-legal-vault</code> repo（不在此 endpoint）。
        </p>
        <p className="mt-1 text-[10px] text-violet-800">
          二进制文件（PDF/图片）改用 <code className="rounded bg-violet-50 px-1">contentBase64</code> 字段（与 content 二选一）。
          单文件 1MB 上限。同 path 已存在 → 409，加时间戳后缀重传。
        </p>
        <p className="mt-1 text-[10px] text-violet-800">
          ✨ <strong>本接口自动帮你写一条 activity-log</strong>（带 vaultPath、vaultWritten=true）—
          单纯文件场景<strong>不要</strong>再重复调 ① activity-log。
        </p>
      </section>

      {/* ③ 部门专用：DB 写入 endpoint（HR 已开 — 其他部门陆续补）*/}
      <section className="mb-6 rounded-xl border border-rose-300 bg-rose-100/40 p-4">
        <h2 className="text-sm font-semibold text-rose-900">
          📋 ③ 写部门 DB 表 · <code className="rounded bg-rose-50 px-1.5 py-0.5">/api/v1/&lt;dept&gt;/&lt;resource&gt;</code>
        </h2>
        <p className="mt-1.5 text-[12px] text-rose-900">
          要把工作成果落成"看板上一条真实业务记录"（员工档案 / 凭证 / 工单 / 资产），
          各部门有专用 endpoint，写入后<strong>看板 KPI + 列表 + 详情页实时刷新</strong>，并自动写一条 activity-log。
        </p>
        <div className="mt-2 space-y-2 text-[11px] text-rose-900">
          <div>
            <strong>人事 · 入职建档（upsert）：</strong>
            {' '}<code className="rounded bg-rose-50 px-1">POST /api/v1/hr/employee-profile</code>
            {' / '}
            <code className="rounded bg-rose-50 px-1">PATCH /api/v1/hr/employee-profile/&lt;id&gt;</code>
            <span className="ml-1 text-rose-700">
              · scope <code className="rounded bg-rose-50 px-1">HR_AI:hr_onboard</code> /{' '}
              <code className="rounded bg-rose-50 px-1">HR_AI:hr_clerk</code> /{' '}
              <code className="rounded bg-rose-50 px-1">HR_ADMIN</code>
            </span>
          </div>
          <pre className="overflow-x-auto rounded bg-slate-900 p-3 font-mono text-[10.5px] leading-relaxed text-slate-100">
{`POST ${dashboardUrl}/api/v1/hr/employee-profile
X-Api-Key: lty_xxxx... (HR_AI 权限)
Content-Type: application/json

{
  "name": "张三",                  // 三选一：name / userEmail / userId（User 必须先存在）
  "department": "产研部",
  "position": "前端工程师",         // 也接受 positionTitle
  "workType": "fulltime",          // fulltime/parttime/intern/contractor（也接受大写 FULL_TIME 等）
  "location": "remote",            // remote/onsite
  "joinDate": "2026-05-13",        // 也接受 hireDate
  "status": "active"               // active/probation/resigned
}

→ 201 created（首次）或 200 updated（同 userId 已有档案，自动 upsert）`}
          </pre>
          <p className="text-[10px] text-rose-800">
            • <strong>upsert 默认</strong>：同 userId 已有档案直接 update 返 200；要严格只创建传{' '}
            <code className="rounded bg-rose-50 px-1">mode:"create"</code> 重复会 409。
            • <strong>User 必须先存在</strong>：`name` 找不到或重名 → 404/422，提示传{' '}
            <code className="rounded bg-rose-50 px-1">userEmail</code> 精确匹配。
          </p>
          <div className="border-t border-rose-200 pt-2 text-rose-700">
            <strong>其他部门写 DB 接口</strong> — 财务凭证 / 行政证照资产 / 法务工单等：陆续补（按上面 HR 同模式抄）。
            暂时可用 ② <code className="rounded bg-rose-50 px-1">vault/commit</code> 落 markdown 报告兜底。
          </div>
        </div>
      </section>

      {/* 步骤 ① · plugin schema */}
      <CozePluginSchemaCard tokenUsageUrl={tokenUsageUrl} />

      {/* 步骤 ② · 每个 AI 的 X-Api-Key 信息 */}
      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
          每个 AI 的 X-Api-Key（{employees.length}）
        </h2>
        {employees.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-6 py-8 text-center text-sm text-slate-500">
            还没有 AI 员工。
            <Link href="/employees" className="ml-2 text-violet-800 hover:underline">
              去 /employees 新建或一键导入财务 ApiKey
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {employees.map((e) => (
              <AiKeyCard
                key={e.id}
                employee={{
                  id: e.id,
                  name: e.name,
                  role: e.role,
                  deptSlug: e.deptSlug,
                  active: e.active,
                  paused: e.paused,
                  dailyLimitHkd: Number(e.dailyLimitHkd),
                }}
                apiKey={e.apiKey}
                tokenUsageUrl={tokenUsageUrl}
              />
            ))}
          </ul>
        )}
      </section>

      {/* 提示 */}
      <section className="rounded-xl border border-amber-300 bg-amber-100/50 p-4 text-xs text-amber-900">
        <strong>明文 X-Api-Key 看板永远不回显</strong> — 看板只存 sha256 hash。每个 AI 卡片只显示
        keyPrefix（如 <code className="rounded bg-white px-1">lty_AbCdE...</code>）让老板对照自己生成时保存的明文 key。丢了只能去
        <Link href="/employees" className="ml-1 text-amber-900 underline">
          /employees
        </Link>{' '}
        重新生成 (🔄 按钮 — ADMIN+)。
      </section>
    </div>
  );
}
