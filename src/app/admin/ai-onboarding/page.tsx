/**
 * AI 接入向导 — /admin/ai-onboarding
 *
 * 老板的 5 个财务 AI（含未来其他部门）跑在 Coze 平台，用的是 Coze 内置
 * 「大模型」节点 — 不能换 base URL（finance_bridge LLM proxy 那条路走
 * 不通）。
 *
 * 现行方案：每个 LLM 节点输出后接一个 plugin 调看板 token-usage。Coze
 * 大模型节点输出 prompt + response 文本，传字符数到看板，看板 ÷3 估算
 * token + 算 HKD 成本。误差 ±10-15%，撞顶判断够用。
 *
 * 本页给老板：
 *   - 一次性建 Coze plugin 的 OpenAPI schema（共享一个，所有 AI 用）
 *   - 每个 AI 员工的 X-Api-Key 提示（带 keyPrefix 让老板对照）
 *   - 工作流加节点的步骤说明
 *   - 一键 curl 测试模板
 *
 * 数据源：AiEmployee + ApiKey (prisma)
 *
 * 权限：ADMIN+（让各部门 ADMIN 自己看教程接 token 监控，不用老板单独教）。
 * keyPrefix 暴露给 ADMIN 也安全 — 看板永不存明文，他们看不到完整 key。
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
  // ADMIN+ 都能看接入教程（部门 ADMIN 自己接自己的部门 AI）
  if (session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

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
            👑 老板专属
          </span>
        </div>
        <Link href="/employees" className="text-xs text-violet-800 hover:underline">
          ← 回 AI 员工档案
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
            <Link href="/overview" className="text-emerald-900 underline">
              /overview
            </Link>{' '}
            显示该 AI 的 token + HKD 成本，状态圆点变绿。
          </li>
        </ol>
        <p className="mt-3 text-[11px] text-slate-600">
          ⚠️ Coze 大模型节点不返回 token usage 字段，看板用「prompt + response 字符数 ÷ 3」估算（中英混合 ~3 char/token）。
          误差 ±10-15%，撞顶判断够用。如有 AI 直接调 Anthropic/OpenAI（绕开 Coze 平台），可以用更精确的 finance_bridge LLM proxy（PR vault#1 已 ready）。
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
        删旧员工 + 新建（带 generateApiKey）拿新 key。
      </section>
    </div>
  );
}
