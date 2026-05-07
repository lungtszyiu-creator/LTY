/**
 * AI 员工档案管理 (/employees) — Step 1
 *
 * 移植自 MC Markets，适配 LTY：
 *   - 仅管理 AI 员工（真人走 LTY 已有 User + HrEmployeeProfile 体系）
 *   - 货币 HKD（LTY 香港公司）
 *   - 复用 LTY 现有 ApiKey 表（apiKeyId FK）+ generateApiKey()
 *   - group 字段 = LTY 部门 slug（柔性 String，不绑 enum）
 *
 * Step 1 范围（按老板节奏走）：
 *   - 列表展示（桌面表格 + 移动卡片）
 *   - 新建 / 编辑 / 停用启用 / 删除（仅 SUPER_ADMIN）
 *   - 实时状态指示：在跑 (<5min) / 待命 (<30min) / 离线 / 从未
 *   - 不含: reportsTo / isSupervisor UI（schema 已放，留 Step 4）
 *   - 不含: token 监控（Step 2）
 *   - 不含: 撞顶暂停（Step 5）
 *
 * 权限：ADMIN+（管理员可看可改），仅 SUPER_ADMIN 能硬删。
 */
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { EmployeesClient, type EmployeeRow } from './_components/EmployeesClient';

export const dynamic = 'force-dynamic';

export default async function EmployeesPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN') {
    redirect('/dashboard');
  }

  const employees = await prisma.aiEmployee.findMany({
    orderBy: [{ active: 'desc' }, { paused: 'desc' }, { layer: 'asc' }, { createdAt: 'desc' }],
    include: {
      apiKey: {
        select: {
          id: true,
          keyPrefix: true,
          scope: true,
          active: true,
          revokedAt: true,
          lastUsedAt: true,
        },
      },
    },
  });

  // 同步拉部门列表给"归属部门"下拉用（LTY Department slug）
  const depts = await prisma.department.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { slug: true, name: true },
  });

  // Decimal → number for client serialization
  const rows: EmployeeRow[] = employees.map((e) => ({
    id: e.id,
    name: e.name,
    role: e.role,
    deptSlug: e.deptSlug,
    layer: e.layer,
    active: e.active,
    dailyLimitHkd: Number(e.dailyLimitHkd),
    paused: e.paused,
    pausedAt: e.pausedAt?.toISOString() ?? null,
    pauseReason: e.pauseReason,
    webhookUrl: e.webhookUrl,
    lastActiveAt: e.lastActiveAt?.toISOString() ?? null,
    isSupervisor: e.isSupervisor,
    reportsToId: e.reportsToId,
    apiKey: e.apiKey
      ? {
          id: e.apiKey.id,
          keyPrefix: e.apiKey.keyPrefix,
          scope: e.apiKey.scope,
          active: e.apiKey.active,
          revokedAt: e.apiKey.revokedAt?.toISOString() ?? null,
          lastUsedAt: e.apiKey.lastUsedAt?.toISOString() ?? null,
        }
      : null,
    createdAt: e.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">AI 员工档案</h1>
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200">
            Step 1 · 基础 CRUD
          </span>
        </div>
        <span className="text-xs text-slate-400">Token 监控 / 上司池 / 撞顶暂停 后续 Step 上线</span>
      </header>
      <p className="mb-5 rounded-xl border border-slate-200 bg-slate-50/40 px-4 py-3 text-xs text-slate-600">
        💡 这里管的是 <strong>AI 员工</strong>（凭证编制员、对账员、法务工单 AI 等）。真人员工请去{' '}
        <a href="/admin/users" className="text-amber-700 hover:underline">用户管理</a>。
        每个 AI 配一把 API Key（lty_... 格式），AI 调看板 API 时挂在 <code className="rounded bg-white px-1">x-api-key</code> header。
      </p>
      <EmployeesClient
        initial={rows}
        depts={depts}
        meRole={session.user.role as 'ADMIN' | 'SUPER_ADMIN'}
      />
    </div>
  );
}
