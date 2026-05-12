/**
 * HR 部 (/dept/hr) —— 主页 dashboard
 *
 * 嵌入 manus 看板的关键功能。复用 LTY 主看板既有：
 * - 账号 → /admin/users
 * - 事务流程 → /approvals + /admin/approvals
 * - 任务 → /dashboard
 * - 员工手册 → /docs
 * - 公开问答 → /faq
 * - 公司制度 → /announcements
 *
 * HR 特有（本部门内建）：员工档案 / 招聘 / 绩效 / 试用期+证件到期监控。
 *
 * Banner 监控（核心）：
 * - 试用期 30 天内到期：HrEmployeeProfile.probationEnd ∈ [今日, 今日+30d]
 * - 证件 60 天内到期：HrEmployeeProfile.idExpireAt ∈ [今日, 今日+60d]
 * - 待 HR 审批：ApprovalInstance.status='IN_PROGRESS' 且 step.role 涉及 HR
 */
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireDeptView } from '@/lib/dept-access';
import { DeptApiKeysCard } from '@/components/dept/DeptApiKeysCard';
import { getScopeChoices } from '@/lib/scope-presets';
import { VaultBrowser } from '@/components/vault/VaultBrowser';
import { AiActivityFeed } from '@/components/ai-dashboard/AiActivityFeed';
import { getDeptAiActivitiesToday } from '@/lib/ai-log';

export const dynamic = 'force-dynamic';

const STAGE_LABEL: Record<string, string> = {
  APPLIED: '投递',
  SCREENING: '初筛',
  INTERVIEWING: '面试中',
  OFFER: 'Offer',
  HIRED: '已到岗',
  REJECTED: '已拒绝',
};

const STAGE_ORDER = ['APPLIED', 'SCREENING', 'INTERVIEWING', 'OFFER', 'HIRED'];

export default async function HrPage() {
  const ctx = await requireDeptView('hr');
  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysOut = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const [
    activeEmployees,
    probationEmployees,
    remoteEmployees,
    onsiteEmployees,
    recruitingPositions,
    pendingApprovals,
    activeCandidates,
    inflightTasks,
    expiringProbation,
    expiringIds,
    candidateStageGroups,
    deptCountGroups,
  ] = await Promise.all([
    prisma.hrEmployeeProfile.count({ where: { status: 'ACTIVE' } }),
    prisma.hrEmployeeProfile.count({ where: { status: 'PROBATION' } }),
    prisma.hrEmployeeProfile.count({
      where: { status: { in: ['ACTIVE', 'PROBATION'] }, workLocation: 'REMOTE' },
    }),
    prisma.hrEmployeeProfile.count({
      where: { status: { in: ['ACTIVE', 'PROBATION'] }, workLocation: 'ONSITE' },
    }),
    prisma.hrPosition.count({ where: { status: 'RECRUITING' } }),
    prisma.approvalInstance.count({ where: { status: 'IN_PROGRESS' } }),
    prisma.hrCandidate.count({
      where: { stage: { in: ['APPLIED', 'SCREENING', 'INTERVIEWING', 'OFFER'] } },
    }),
    prisma.task.count({ where: { status: { in: ['OPEN', 'CLAIMED', 'SUBMITTED'] } } }),
    prisma.hrEmployeeProfile.findMany({
      where: {
        status: { in: ['ACTIVE', 'PROBATION'] },
        probationEnd: { gte: now, lte: thirtyDaysOut },
      },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { probationEnd: 'asc' },
      take: 5,
    }),
    prisma.hrEmployeeProfile.findMany({
      where: {
        status: { in: ['ACTIVE', 'PROBATION'] },
        idExpireAt: { gte: now, lte: sixtyDaysOut },
      },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { idExpireAt: 'asc' },
      take: 5,
    }),
    prisma.hrCandidate.groupBy({
      by: ['stage'],
      _count: { _all: true },
    }),
    prisma.departmentMembership.groupBy({
      by: ['departmentId'],
      _count: { _all: true },
    }),
  ]);

  const aiActivities = await getDeptAiActivitiesToday(['hr']);

  const stageMap = Object.fromEntries(
    candidateStageGroups.map((g) => [g.stage, g._count._all]),
  );
  const totalEmployees = activeEmployees + probationEmployees;
  const allDepts = await prisma.department.findMany({
    where: { id: { in: deptCountGroups.map((g) => g.departmentId) } },
    select: { id: true, name: true, slug: true },
  });
  const deptCountMap = Object.fromEntries(
    deptCountGroups.map((g) => [g.departmentId, g._count._all]),
  );
  const deptList = allDepts
    .map((d) => ({ ...d, count: deptCountMap[d.id] ?? 0 }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">人事部</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
              ctx.isSuperAdmin
                ? 'bg-rose-50 text-rose-700 ring-rose-200'
                : ctx.level === 'LEAD'
                ? 'bg-amber-50 text-amber-700 ring-amber-200'
                : 'bg-sky-50 text-sky-700 ring-sky-200'
            }`}
          >
            {ctx.isSuperAdmin ? '👑 总管' : ctx.level === 'LEAD' ? 'HR 主管' : '部门成员'}
          </span>
        </div>
        <span className="text-xs text-slate-400">{now.toLocaleString('zh-CN', { hour12: false })}</span>
      </header>

      {/* 监控 banner */}
      {expiringProbation.length > 0 && (
        <div className="mb-3 rounded-xl border border-amber-300/60 bg-amber-50/60 px-4 py-2.5 text-xs text-amber-900">
          ⚠ 转正到期提醒：{expiringProbation.map((e) => e.user.name ?? e.user.email).join(' / ')}
          （30 天内试用期结束 {expiringProbation.length} 人，请及时处理转正）
        </div>
      )}
      {expiringIds.length > 0 && (
        <div className="mb-3 rounded-xl border border-rose-300/60 bg-rose-50/60 px-4 py-2.5 text-xs text-rose-900">
          🔔 证件到期提醒：{expiringIds.map((e) => e.user.name ?? e.user.email).join(' / ')}
          （60 天内证件到期 {expiringIds.length} 人，请及时更新）
        </div>
      )}
      {pendingApprovals > 0 && (
        <div className="mb-3 rounded-xl border border-sky-300/60 bg-sky-50/60 px-4 py-2.5 text-xs text-sky-900">
          ℹ 待审批申请：共 {pendingApprovals} 条申请等待处理 ·{' '}
          <Link href="/approvals" className="underline">
            查看审批列表 →
          </Link>
        </div>
      )}

      {/* 8 KPI */}
      <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <KpiCard label="在职员工" value={activeEmployees} hint={`${probationEmployees} 试用期`} accent="violet" />
        <KpiCard label="员工总数" value={totalEmployees} accent="sky" />
        <KpiCard label="远程办公" value={remoteEmployees} accent="emerald" />
        <KpiCard label="坐班" value={onsiteEmployees} accent="amber" />
        <KpiCard label="在招岗位" value={recruitingPositions} accent="rose" />
        <KpiCard label="在招候选人" value={activeCandidates} accent="violet" />
        <KpiCard label="待审批" value={pendingApprovals} accent={pendingApprovals > 0 ? 'rose' : 'slate'} />
        <KpiCard label="进行中任务" value={inflightTasks} accent="sky" />
      </section>

      {/* 招聘漏斗 */}
      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">招聘漏斗</h2>
          <Link href="/dept/hr/positions" className="text-xs text-sky-700 hover:underline">
            管理岗位 →
          </Link>
        </div>
        <div className="grid grid-cols-5 gap-2 sm:gap-3">
          {STAGE_ORDER.map((s) => (
            <div key={s} className="rounded-lg bg-slate-50 px-3 py-2 text-center ring-1 ring-slate-100">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">{STAGE_LABEL[s]}</div>
              <div className="mt-0.5 text-xl font-semibold tabular-nums text-slate-800">{stageMap[s] ?? 0}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 部门人数分布 */}
      {deptList.length > 0 && (
        <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">部门人数分布</h2>
          <ul className="space-y-1.5">
            {deptList.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/dept/${d.slug}`} className="text-slate-700 hover:text-slate-900 hover:underline">
                  {d.name}
                </Link>
                <span className="font-mono tabular-nums text-slate-500">{d.count} 人</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 快速入口 */}
      <section className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <NavCard href="/dept/hr/employees" emoji="👤" label="员工档案" hint={`${totalEmployees} 人`} />
        <NavCard href="/dept/hr/positions" emoji="📋" label="招聘管理" hint={`${recruitingPositions} 在招`} />
        <NavCard href="/dept/hr/candidates" emoji="📥" label="候选人库" hint={`${activeCandidates} 在招`} />
        <NavCard href="/approvals" emoji="📝" label="审批" hint={`${pendingApprovals} 待处理`} />
        <NavCard href="/admin/users" emoji="🔑" label="账号管理" hint="全公司用户" />
        <NavCard href="/docs" emoji="📖" label="员工手册" hint="LTY /docs" />
        <NavCard href="/faq" emoji="❓" label="公开问答" hint="FAQ" />
        <NavCard href="/announcements" emoji="📣" label="公司制度 / 公告" hint="" />
      </section>

      {/* Vault 文档浏览（raw/人事部/）—— 实际 PDF / 合同 / 政策 */}
      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
          📁 Vault 文档（raw/人事部/）
        </h2>
        <VaultBrowser
          apiPath="/api/dept/vault-tree"
          initialPath="raw/人事部"
          repoUrl="https://github.com/lungtszyiu-creator/lty-vault/tree/main/raw/%E4%BA%BA%E4%BA%8B%E9%83%A8"
        />
      </section>

      {/* 人事 AI 今日工作日记 — 老板 5/13：HR AI 自报活动同步显示在本部门看板 + AI 部看板 */}
      <div className="mb-6">
        <AiActivityFeed rows={aiActivities} />
      </div>

      {(ctx.isSuperAdmin || ctx.level === 'LEAD') && (
        <DeptApiKeysCard
          deptName="人事部"
          scopePrefix="HR_"
          scopeChoices={getScopeChoices('HR_')}
          canManage={ctx.isSuperAdmin || ctx.level === 'LEAD'}
          accent="rose"
        />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number;
  hint?: string;
  accent: 'rose' | 'amber' | 'emerald' | 'sky' | 'violet' | 'slate';
}) {
  const map: Record<typeof accent, string> = {
    rose: 'from-rose-50 to-rose-100/40 ring-rose-200/60 text-rose-700',
    amber: 'from-amber-50 to-amber-100/40 ring-amber-200/60 text-amber-700',
    emerald: 'from-emerald-50 to-emerald-100/40 ring-emerald-200/60 text-emerald-700',
    sky: 'from-sky-50 to-sky-100/40 ring-sky-200/60 text-sky-700',
    violet: 'from-violet-50 to-violet-100/40 ring-violet-200/60 text-violet-700',
    slate: 'from-slate-50 to-slate-100/40 ring-slate-200/60 text-slate-700',
  };
  return (
    <div className={`rounded-xl bg-gradient-to-br p-3 ring-1 sm:p-4 ${map[accent]}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider opacity-80 sm:text-xs">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums sm:mt-1 sm:text-3xl">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] opacity-70">{hint}</div>}
    </div>
  );
}

function NavCard({
  href,
  emoji,
  label,
  hint,
}: {
  href: string;
  emoji: string;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-center transition hover:border-rose-300 hover:bg-rose-50/40"
    >
      <div className="text-2xl">{emoji}</div>
      <div className="mt-1 text-xs font-medium text-slate-800">{label}</div>
      {hint && <div className="mt-0.5 text-[10px] text-slate-500">{hint}</div>}
    </Link>
  );
}
