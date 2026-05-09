/**
 * /dept/ai/onboarding/api-trigger — API 触发入门 prompt 生成器
 *
 * 同事们烧 Coze Credit (400/月套餐限额) 是因为他们在 Coze GUI 内手动跑
 * Agent / Workflow。一旦工作流改成"外部 API 触发"模式（POST /v1/workflow/run），
 * 烧的就是 Coze tokens 池子（OpenAI 原价透传，不抽成）。
 *
 * 本页让所有 active 同事:
 *   1. 选自己部门 + AI 员工 → 自动填好 keyPrefix/部门 slug 等到 prompt 里
 *   2. 选触发方式 (TG bot / 看板按钮 / Vercel cron / 通用 webhook)
 *   3. 一键复制完整 prompt + 触发模板代码
 *   4. 把 prompt 粘贴给自己的 AI 助手 (Claude/ChatGPT/Coze bot 都行)，AI 一步步教
 *
 * 权限：所有 active 员工可见（透明文化决策 2026-05-09）。
 * 原 /admin/ai-onboarding/api-trigger 保留 redirect 到本页（老板已转发旧 URL 给同事群）。
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { PromptGenerator } from './_components/PromptGenerator';

export const dynamic = 'force-dynamic';

export default async function ApiTriggerPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  // 全员可见（透明文化）— 但仍要求 active 员工
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { active: true },
  });
  if (!dbUser?.active) redirect('/login');

  const [employees, depts] = await Promise.all([
    prisma.aiEmployee.findMany({
      where: { active: true },
      orderBy: [{ deptSlug: 'asc' }, { layer: 'asc' }, { createdAt: 'desc' }],
      include: {
        apiKey: { select: { keyPrefix: true, scope: true } },
      },
    }),
    prisma.department.findMany({
      where: { active: true },
      orderBy: { order: 'asc' },
      select: { slug: true, name: true },
    }),
  ]);

  const dashboardUrl = (process.env.NEXTAUTH_URL || 'https://lty-nu.vercel.app').replace(/\/$/, '');

  const employeeOptions = employees.map((e) => {
    const dept = depts.find((d) => d.slug === e.deptSlug);
    return {
      id: e.id,
      name: e.name,
      role: e.role,
      deptSlug: e.deptSlug,
      deptName: dept?.name ?? null,
      keyPrefix: e.apiKey?.keyPrefix ?? null,
      scope: e.apiKey?.scope ?? null,
    };
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            API 触发 · prompt 生成器
          </h1>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-800 ring-1 ring-violet-300">
            全员可见
          </span>
        </div>
        <Link href="/dept/ai/onboarding" className="text-xs text-violet-800 hover:underline">
          ← 回 AI 接入主向导
        </Link>
      </header>

      <section className="mb-5 rounded-xl border border-emerald-300 bg-emerald-100/40 p-4 text-sm text-emerald-900">
        <strong>为什么要做 API 触发：</strong> 在 Coze GUI 内手动跑 Agent 烧的是 <strong>Credit (400/月套餐)</strong>，
        外部 API 触发 (`POST /v1/workflow/run`) 烧的是 <strong>Coze tokens</strong>（OpenAI 原价透传，不抽成）。
        本页给你生成「填好空的 prompt + 触发代码模板」， 复制给你的 AI 助手 (Claude/ChatGPT)，
        AI 一步步带你做。
      </section>

      <PromptGenerator
        employees={employeeOptions}
        depts={depts}
        dashboardUrl={dashboardUrl}
      />
    </div>
  );
}
