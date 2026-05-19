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

      {/* 四档写入 endpoint 总览 — 老板 5/13 + Maggie 5/18 反馈：AI 直接写 vault
          会污染人工目录。新增 ④ ai-outputs 走"先 inbox 后审批后入 vault"流。 */}
      <section className="mb-6 rounded-xl border-2 border-emerald-300 bg-emerald-50/60 p-4">
        <h2 className="text-sm font-semibold text-emerald-900">
          🚀 AI 写入看板 · 四个接口对照表
        </h2>
        <p className="mt-1.5 text-[12px] text-emerald-900">
          你的 AI 干完一项工作要把成果"交"到看板上，按 <strong>成果有多重 / 需不需要人工审批</strong> 选 endpoint：
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
                  <strong>📥 AI 输出待审 inbox</strong>{' '}
                  <span className="ml-1 rounded-full bg-amber-200/70 px-1 py-0.5 text-[9px] font-medium text-amber-900">5/18 新</span>
                  <div className="text-[10px] text-emerald-700">
                    需人工审批后才入 vault — <strong>法务/合规高风险产出走这条</strong>（防污染人工目录）
                  </div>
                </td>
                <td className="px-2 py-2 align-top">
                  <code className="rounded bg-white px-1">POST /api/v1/ai-outputs</code>
                </td>
                <td className="px-2 py-2 align-top">
                  落 AiOutput 表 (pending) → /dept/&lt;部门&gt;?tab=ai-outputs 审核 → approved 后<strong>系统自动 commit 到 vault</strong>
                </td>
              </tr>
              <tr className="border-t border-emerald-200/60">
                <td className="px-2 py-2 align-top">
                  <strong>📁 直接落 vault</strong>
                  <div className="text-[10px] text-emerald-700">
                    简单 markdown / PDF — <strong>不需要人工审批</strong>的常规归档（行政部审计报告等）
                  </div>
                </td>
                <td className="px-2 py-2 align-top">
                  <code className="rounded bg-white px-1">POST /api/v1/vault/commit</code>
                </td>
                <td className="px-2 py-2 align-top">
                  文件提交 GitHub <code className="text-[10px]">lty-vault</code> 直入对应部门目录（法务部已禁此路径，强制走 ④ inbox）；自动写日记
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
          💡 <strong>怎么挑：</strong> AI 产出会进 vault 知识库吗？需要 → 走 ②（人工审批门）或 ③（绕过审批，慎用）；
          不进 vault，只是看板业务记录 → 走 ④；只是日记，没文件没 DB → 走 ①。
        </p>
      </section>

      {/* ② AI 输出审核 inbox（防 vault 污染）— Maggie 5/18 paradigm 修正后核心路径 */}
      <section className="mb-6 rounded-xl border-2 border-amber-400 bg-amber-50/60 p-4">
        <h2 className="text-sm font-semibold text-amber-900">
          📥 ② AI 输出审核 inbox · <code className="rounded bg-amber-100 px-1.5 py-0.5">/api/v1/ai-outputs</code>
          <span className="ml-2 rounded-full bg-amber-200/70 px-1.5 py-0.5 text-[9px] font-medium text-amber-900">
            5/18 新
          </span>
        </h2>
        <p className="mt-1.5 text-[12px] text-amber-900">
          法务合同审查 / MC 法务牌照答疑 / 跨部门高风险产出走这条 — <strong>不直接污染 vault</strong>。
          AI 落到待审 inbox → 人工 approve → 系统自动 commit 到 vault `raw/&lt;部门&gt;/AI-审核通过/...`；
          rejected 留 audit 不入 vault。一份 paradigm，所有部门通用。
        </p>
        <pre className="mt-2.5 overflow-x-auto rounded bg-slate-900 p-3 font-mono text-[10.5px] leading-relaxed text-slate-100">
{`POST ${dashboardUrl}/api/v1/ai-outputs
X-Api-Key: lty_xxxx...  (任何 active AI 员工 key)
Content-Type: application/json

{
  "output_id": "lty-contract-20260518T1234",   // 选填 · Bot 幂等 key, 同 id 重传 upsert
  "agent_name": "LTY-合同审查",                 // 默认用 AI 员工档案 name
  "output_type": "contract_review",            // 自由 string: contract_review/license_query/weekly_report 等
  "title": "...",
  "content_markdown": "主报告 markdown ...",    // 必填, 最长 50000 字符
  "revised_contract": "修订版合同 ...",          // 选填, 最长 50000
  "clean_contract": "签约版合同 ...",            // 选填, 最长 50000
  "source_input": "原始输入留 audit",            // 选填, 最长 30000
  "metadata": { "amount_cny": 100000, "risk_level": "high" },
  "triggered_by": "@cici_username",
  "token_cost_hkd": 0.456
}`}
        </pre>
        <p className="mt-1.5 text-[10px] text-amber-800">
          • <strong>review_status 由系统强制为 pending_human_review</strong>，AI 不能直接传 approved/rejected（防越权审批）。
          • <strong>output_id 幂等</strong>：同 id 重传走 upsert（但已审核状态不允许覆盖，409）。
          • <strong>deptSlug 自动用 AI 档案的</strong>，AI 不能写其他部门的 inbox（403 DEPT_MISMATCH）。
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
          📁 ③ 直接落 vault · <code className="rounded bg-violet-50 px-1.5 py-0.5">/api/v1/vault/commit</code>
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
          📋 ④ 写部门 DB 表 · <code className="rounded bg-rose-50 px-1.5 py-0.5">/api/v1/&lt;dept&gt;/&lt;resource&gt;</code>
        </h2>
        <p className="mt-1.5 text-[12px] text-rose-900">
          要把工作成果落成"看板上一条真实业务记录"（员工档案 / 凭证 / 工单 / 资产），
          各部门有专用 endpoint，写入后<strong>看板 KPI + 列表 + 详情页实时刷新</strong>，并自动写一条 activity-log。
        </p>
        <ul className="mt-2 space-y-1.5 text-[11px] text-rose-900">
          <li>
            <strong>人事 · 入职建档：</strong>
            {' '}<code className="rounded bg-rose-50 px-1">POST /api/v1/hr/employee-profile</code>
            {' / '}
            <code className="rounded bg-rose-50 px-1">PATCH /api/v1/hr/employee-profile/&lt;id&gt;</code>
            <span className="ml-1 text-rose-700">
              · scope <code className="rounded bg-rose-50 px-1">HR_AI:hr_onboard</code> /{' '}
              <code className="rounded bg-rose-50 px-1">HR_AI:hr_clerk</code> /{' '}
              <code className="rounded bg-rose-50 px-1">HR_ADMIN</code>
              {' '}— body: <code className="rounded bg-rose-50 px-1">userEmail</code>{' '}或{' '}
              <code className="rounded bg-rose-50 px-1">userId</code>{' '}+ position / hireDate / status...
            </span>
          </li>
          <li>
            <span className="text-rose-700">
              <strong>其他部门写 DB 接口</strong> — 财务凭证 / 行政证照资产 / 法务工单等：陆续补（按上面 HR 同模式抄）。
              暂时可用 ② <code className="rounded bg-rose-50 px-1">vault/commit</code> 落 markdown 报告兜底。
            </span>
          </li>
        </ul>
      </section>

      {/* ⑤ vault 只读检索 + ⑥ 单文件正文 — Maggie V5.2 / 5/19 v1.1 法务"管家"答疑路径 */}
      <section className="mb-6 rounded-xl border-2 border-sky-300 bg-sky-50/60 p-4">
        <h2 className="text-sm font-semibold text-sky-900">
          🔍 AI 读 vault · 两个只读接口（法务证照管家 / MC 牌照管家用）
          <span className="ml-2 rounded-full bg-sky-200/70 px-1.5 py-0.5 text-[9px] font-medium text-sky-900">
            5/19 v1.1
          </span>
        </h2>
        <p className="mt-1.5 text-[12px] text-sky-900">
          法务"管家"类 AI 员工答疑（&ldquo;商业登记证什么时候到期？&rdquo; / &ldquo;装修发票在哪？&rdquo; / &ldquo;营业执照号是多少？&rdquo;）需要
          <strong>只读</strong>vault 已有档案。两个 endpoint 配合用：
          <strong className="ml-1">⑤ 检索</strong>找到候选文件 →
          <strong className="ml-1">⑥ 单文件深读</strong>拿正文做精准回答。
        </p>

        {/* ⑤ vault/search */}
        <div className="mt-3 rounded-lg border border-sky-200 bg-white/60 p-3">
          <h3 className="text-[12px] font-semibold text-sky-900">
            ⑤ vault 检索 · <code className="rounded bg-sky-100 px-1">GET /api/v1/vault/search</code>
          </h3>
          <pre className="mt-1.5 overflow-x-auto rounded bg-slate-900 p-3 font-mono text-[10.5px] leading-relaxed text-slate-100">
{`GET ${dashboardUrl}/api/v1/vault/search?dept=lty-legal&category=证照&q=登记证&limit=5&with_mtime=true
X-Api-Key: lty_xxx  (或 X-Read-Key, 等价 alias)`}
          </pre>
          <p className="mt-1.5 text-[10px] text-sky-800">
            • <strong>dept</strong> 必填，接受 <code className="rounded bg-sky-50 px-1">lty-legal / mc-legal / 法务部 / MC法务 / LTY_LEGAL / MC_LEGAL</code>
            <br />
            • <strong>category</strong> 选填，按 vault 第一级目录过滤（LTY: 证照/合同/票据/声明/争议诉讼）
            <br />
            • <strong>q</strong> 选填，模糊匹配路径 + 文本文件正文
            <br />
            • <strong>limit</strong> 默认 5，最大 20
            <br />
            • <strong>with_mtime=true</strong> 选填 v1.1，返每个 result 的最后 commit 时间（每 result 多 1 次 GitHub 调用，限频时建议关）
          </p>
          <p className="mt-1 text-[10px] text-sky-800">
            返回 <code className="rounded bg-sky-50 px-1">results[]</code>：
            doc_id / title / category / file_url / content_snippet（前 500 字摘要）/ path / size_bytes / updated_at
          </p>
        </div>

        {/* ⑥ vault/file（5/19 v1.1）*/}
        <div className="mt-3 rounded-lg border border-sky-200 bg-white/60 p-3">
          <h3 className="text-[12px] font-semibold text-sky-900">
            ⑥ vault 单文件正文 · <code className="rounded bg-sky-100 px-1">GET /api/v1/vault/file</code>
            <span className="ml-2 rounded-full bg-sky-200/70 px-1.5 py-0.5 text-[9px] font-medium text-sky-900">
              5/19 v1.1 新
            </span>
          </h3>
          <p className="mt-1.5 text-[11px] text-sky-900">
            vault/search 给的 content_snippet 对 PDF 只有 <code className="rounded bg-sky-50 px-1">[PDF 文件] 文件名</code>，
            AI 答不了 &ldquo;营业执照号是多少 / 注册资本多少 / 到期日&rdquo; 这类需要正文的问题。本 endpoint 给 path
            返完整文本（PDF 抽文字 / docx 抽文字 / markdown 原文）。
          </p>
          <pre className="mt-1.5 overflow-x-auto rounded bg-slate-900 p-3 font-mono text-[10.5px] leading-relaxed text-slate-100">
{`GET ${dashboardUrl}/api/v1/vault/file?dept=lty-legal&path=raw/法务部/证照/LTY-HK-BR-2024.pdf
X-Api-Key: lty_xxx  (或 X-Read-Key)`}
          </pre>
          <p className="mt-1.5 text-[10px] text-sky-800">
            • <strong>dept</strong> + <strong>path</strong> 必填，path 必须落在 dept pathPrefix 下（LTY key 读 MC vault 返 403 PATH_OUT_OF_DEPT）
            <br />
            • 支持：.pdf（pdf-parse 抽文本）/ .docx（mammoth 抽文本）/ .md / .markdown / .txt / .json / .yaml
            <br />
            • 不支持：.doc 老格式 / .xlsx / 图片 — 返占位字符串（要原文件请用 file_url 在 GitHub 看）
            <br />
            • 文本上限 500k 字符；超长返 <code className="rounded bg-sky-50 px-1">truncated: true</code>
            <br />
            • 单文件 raw 上限 20MB；超过返 413
          </p>
          <p className="mt-1 text-[10px] text-sky-800">
            返回字段：path / mime_type / content_text / size_bytes / sha / updated_at / truncated / extracted_via（pdf-parse | mammoth | raw | placeholder）
          </p>
        </div>

        <p className="mt-2.5 text-[10px] text-sky-800">
          🔐 <strong>物理隔离</strong>：lty-legal → <code className="rounded bg-sky-50 px-1">lty-vault</code> repo（VAULT_GITHUB_TOKEN）；
          mc-legal → <code className="rounded bg-sky-50 px-1">mc-legal-vault</code> repo（MC_VAULT_GITHUB_TOKEN）。
          两套 token 独立，scope 跟 dept 强校验（403 SCOPE_DEPT_MISMATCH）。
        </p>
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
