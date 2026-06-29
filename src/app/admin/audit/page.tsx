/**
 * 审计中心 v2 — 2026-06-29
 *
 * 加 "全局" tab (GenericAuditLog) 涵盖 Submission/User/Doc/Folder/Department/Position 等所有接入资源
 *
 * 数据源:
 *   - GenericAuditLog (v2 通用表)
 *   - TaskAuditLog    (v1 专属, Task 双写两边)
 *   - VoucherAuditLog (已有 42 行)
 *   - AiActivityLog   (已有 540+ 行)
 *   - ApprovalInstance + ApprovalStep
 */
import Link from 'next/link';
import { requireAdmin } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import AuditCenterClient from './audit-client';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;

export default async function AuditCenterPage({
  searchParams,
}: {
  searchParams: { tab?: string; q?: string; from?: string; to?: string; actor?: string; resourceType?: string };
}) {
  await requireAdmin();

  const tab = searchParams.tab || 'global';
  const q = (searchParams.q || '').trim();
  const fromDate = searchParams.from ? new Date(searchParams.from) : null;
  const toDate = searchParams.to ? new Date(searchParams.to) : null;
  const actorFilter = (searchParams.actor || '').trim();
  const resourceTypeFilter = (searchParams.resourceType || '').trim();

  const baseWhere = {
    createdAt: {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    },
  };

  // ─── 全局审计 (GenericAuditLog) ─────────────────────────
  const globalWhere: any = { ...baseWhere };
  if (resourceTypeFilter) globalWhere.resourceType = resourceTypeFilter;
  if (actorFilter) {
    globalWhere.OR = [
      { actorEmail: { contains: actorFilter, mode: 'insensitive' } },
      { actorName: { contains: actorFilter, mode: 'insensitive' } },
    ];
  }
  if (q) {
    globalWhere.OR = [
      ...(globalWhere.OR ?? []),
      { resourceId: { contains: q } },
      { action: { contains: q } },
      { resourceType: { contains: q, mode: 'insensitive' } },
    ];
  }
  const [globalAudits, globalAuditTotal, resourceTypeStats] = await Promise.all([
    prisma.genericAuditLog.findMany({
      where: globalWhere,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
    }),
    prisma.genericAuditLog.count({ where: globalWhere }),
    prisma.genericAuditLog.groupBy({
      by: ['resourceType'],
      _count: { _all: true },
      orderBy: { _count: { resourceType: 'desc' } },
    }),
  ]);

  // ─── Task 操作(v1 TaskAuditLog 兼容)─────────────────────
  const taskAuditWhere: any = { ...baseWhere };
  if (actorFilter) {
    taskAuditWhere.OR = [
      { actorEmail: { contains: actorFilter, mode: 'insensitive' } },
      { actorName: { contains: actorFilter, mode: 'insensitive' } },
    ];
  }
  if (q) {
    taskAuditWhere.OR = [
      ...(taskAuditWhere.OR ?? []),
      { taskId: { contains: q } },
      { action: { contains: q } },
    ];
  }
  const [taskAudits, taskAuditTotal] = await Promise.all([
    prisma.taskAuditLog.findMany({
      where: taskAuditWhere,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
    }),
    prisma.taskAuditLog.count({ where: taskAuditWhere }),
  ]);

  // ─── 凭证操作 ────────────────────────────────────────
  const voucherAuditWhere: any = { ...baseWhere };
  if (actorFilter) {
    voucherAuditWhere.OR = [
      { changedById: { contains: actorFilter } },
      { byAi: { contains: actorFilter, mode: 'insensitive' } },
    ];
  }
  if (q) {
    voucherAuditWhere.OR = [
      ...(voucherAuditWhere.OR ?? []),
      { voucherId: { contains: q } },
      { action: { contains: q } },
      { reason: { contains: q, mode: 'insensitive' } },
    ];
  }
  const [voucherAudits, voucherAuditTotal] = await Promise.all([
    prisma.voucherAuditLog.findMany({
      where: voucherAuditWhere,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
    }),
    prisma.voucherAuditLog.count({ where: voucherAuditWhere }),
  ]);

  // ─── AI 员工 ────────────────────────────────────────
  const aiAuditWhere: any = { ...baseWhere };
  if (actorFilter) {
    aiAuditWhere.aiRole = { contains: actorFilter, mode: 'insensitive' };
  }
  if (q) {
    aiAuditWhere.OR = [
      { action: { contains: q } },
      { payload: { contains: q, mode: 'insensitive' } },
      { errorMessage: { contains: q, mode: 'insensitive' } },
      { aiRole: { contains: q, mode: 'insensitive' } },
    ];
  }
  const [aiActivities, aiActivityTotal] = await Promise.all([
    prisma.aiActivityLog.findMany({
      where: aiAuditWhere,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
    }),
    prisma.aiActivityLog.count({ where: aiAuditWhere }),
  ]);

  // ─── 审批流转 ───────────────────────────────────────
  const approvalWhere: any = { ...baseWhere };
  if (q) {
    approvalWhere.title = { contains: q, mode: 'insensitive' };
  }
  if (actorFilter) {
    approvalWhere.initiator = {
      OR: [
        { email: { contains: actorFilter, mode: 'insensitive' } },
        { name: { contains: actorFilter, mode: 'insensitive' } },
      ],
    };
  }
  const [approvals, approvalTotal] = await Promise.all([
    prisma.approvalInstance.findMany({
      where: approvalWhere,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      include: {
        initiator: { select: { id: true, name: true, email: true } },
        steps: {
          include: { approver: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    }),
    prisma.approvalInstance.count({ where: approvalWhere }),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-6">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-xl font-semibold text-slate-900">审计中心 · v2</h1>
          <div className="text-xs text-slate-500">
            最近 100 条/tab · 全量请用筛选缩范围
          </div>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          看板上"谁动过什么"统一入口。**v2 新增全局审计**(GenericAuditLog),涵盖 User / Doc / Folder / Department / Position 等通用资源
          的 DELETE/UPDATE 操作,2026-06-29 上线。Task 留 v1 专属 tab 兼容;凭证/AI/审批延续原有数据源。
        </p>
        <nav className="mt-3 text-xs text-slate-500">
          <span className="mr-2">现有零散审计入口:</span>
          <Link href="/admin/leave-ledger" className="mr-3 underline hover:text-slate-700">
            假期流水
          </Link>
          <Link href="/admin/notifications" className="mr-3 underline hover:text-slate-700">
            通知日志
          </Link>
          <Link href="/admin/telegram-notifications" className="mr-3 underline hover:text-slate-700">
            TG 通知失败
          </Link>
          <Link href="/admin/approvals" className="mr-3 underline hover:text-slate-700">
            审批后台
          </Link>
        </nav>
      </header>

      <AuditCenterClient
        initialTab={tab}
        initialFilters={{
          q,
          from: searchParams.from || '',
          to: searchParams.to || '',
          actor: actorFilter,
          resourceType: resourceTypeFilter,
        }}
        resourceTypeStats={resourceTypeStats.map((s) => ({
          resourceType: s.resourceType,
          count: s._count._all,
        }))}
        data={{
          global: { rows: globalAudits, total: globalAuditTotal },
          task: { rows: taskAudits, total: taskAuditTotal },
          voucher: { rows: voucherAudits, total: voucherAuditTotal },
          ai: { rows: aiActivities, total: aiActivityTotal },
          approval: { rows: approvals, total: approvalTotal },
        }}
      />
    </main>
  );
}
