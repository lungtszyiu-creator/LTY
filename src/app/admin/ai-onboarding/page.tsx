/**
 * AI 接入向导 — /admin/ai-onboarding
 *
 * 老板配 5 个财务 AI（含未来其他部门）走 finance_bridge LLM proxy 时的
 * 一站式参考页。打开就能看到：
 *   - bridge 在不在线（点按钮探活 /healthz）
 *   - 每个 AI 员工的接入卡片：base URL / 必填 header / curl 测试 / Coze
 *     plugin JSON 配置模板 — 都带"复制"按钮
 *   - 看板 token 上报回路图（让老板理解流量怎么走）
 *
 * 数据源：
 *   - AiEmployee + ApiKey (prisma)
 *   - 看板 base URL：NEXTAUTH_URL env（部署时已配）
 *   - bridge base URL：FINANCE_BRIDGE_URL env（已在 LTY env 用 reply 直推）
 *
 * 注意：明文 ApiKey 看板只存 hash，**永远没法回显**。本页只显示
 * keyPrefix（lty_xxxxxxxx…），让老板对照自己保存的明文判断是哪把。
 *
 * 权限：仅 SUPER_ADMIN。
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { HealthCheckButton } from './_components/HealthCheckButton';
import { AiSetupCard } from './_components/AiSetupCard';

export const dynamic = 'force-dynamic';

export default async function AiOnboardingPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  const employees = await prisma.aiEmployee.findMany({
    orderBy: [{ active: 'desc' }, { paused: 'desc' }, { layer: 'asc' }, { createdAt: 'desc' }],
    include: {
      apiKey: {
        select: { keyPrefix: true, scope: true, active: true, revokedAt: true, lastUsedAt: true },
      },
    },
  });

  const bridgeUrl =
    (process.env.FINANCE_BRIDGE_URL || 'https://yoyodemacbook-pro.tail2206a1.ts.net').replace(/\/$/, '');
  const dashboardUrl = (process.env.NEXTAUTH_URL || 'https://lty-nu.vercel.app').replace(/\/$/, '');

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

      {/* 流量回路图解 */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          流量回路
        </h2>
        <div className="overflow-x-auto">
          <pre className="text-[11px] leading-relaxed text-slate-700">
{`AI（Coze plugin / n8n / 脚本）
   │ 1. POST 调 LLM
   │    base URL = ${bridgeUrl}/llm/anthropic 或 /llm/openai
   │    header   = X-Api-Key: lty_xxx (看板员工 key)
   │              + X-Api-Key: sk-xxx 或 Authorization: Bearer (LLM key)
   ▼
finance_bridge (Mac, FastAPI on Tailscale Funnel)
   │ 2. 透明转发到 api.anthropic.com / api.openai.com
   │    收到 LLM response 后 fire-and-forget 抓 usage
   │ 3. 异步 POST 上报 → 看板 /api/v1/token-usage
   ▼
LTY 看板 (${dashboardUrl})
   │ 4. 服务端 computeCostHkd() 算 HKD 成本（不信任前端）
   │ 5. 写 TokenUsage + 更新员工 lastActiveAt
   │ 6. 撞顶 dailyLimitHkd → 自动 paused + TG 告警老板
   ▼
/overview AI 总览：今日 hero / Top10 / 模型分布 / 趋势图`}
          </pre>
        </div>
      </section>

      {/* bridge 探活 */}
      <section className="mb-6">
        <HealthCheckButton bridgeUrl={bridgeUrl} />
      </section>

      {/* AI 员工接入卡片 */}
      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
          AI 员工 ({employees.length})
        </h2>
        {employees.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-6 py-8 text-center text-sm text-slate-500">
            还没有 AI 员工。
            <Link href="/employees" className="ml-2 text-violet-800 hover:underline">
              去 /employees 新建或导入财务 ApiKey
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {employees.map((e) => (
              <AiSetupCard
                key={e.id}
                employee={{
                  id: e.id,
                  name: e.name,
                  role: e.role,
                  deptSlug: e.deptSlug,
                  active: e.active,
                  paused: e.paused,
                  dailyLimitHkd: Number(e.dailyLimitHkd),
                  lastActiveAt: e.lastActiveAt?.toISOString() ?? null,
                }}
                apiKey={e.apiKey}
                bridgeUrl={bridgeUrl}
                dashboardUrl={dashboardUrl}
              />
            ))}
          </ul>
        )}
      </section>

      {/* 提示卡 */}
      <section className="rounded-xl border border-amber-300 bg-amber-100/50 p-4 text-xs text-amber-900">
        <strong>明文 key 看板永远没法回显</strong> — 看板只存 sha256 hash。每个 AI 卡片只显示
        keyPrefix（如 <code className="rounded bg-white px-1">lty_AbCdE...</code>），让老板对照自己保存的明文确认是哪把。
        丢了只能去 /employees 删旧员工 + 新建（带 generateApiKey）拿新 key。
      </section>
    </div>
  );
}
