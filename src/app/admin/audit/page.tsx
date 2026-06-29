/**
 * 审计中心 v1 — 2026-06-29
 *
 * 一个页面看清 LTY 看板所有"谁动过什么"的留痕。
 *
 * 数据源(只读现有 audit 表):
 *   - TaskAuditLog  (今天新加)
 *   - VoucherAuditLog (已有 42 行)
 *   - AiActivityLog   (已有 540 行)
 *   - ApprovalInstance + ApprovalStep (已有 59/69 行)
 *
 * 路径:/admin/audit
 * 权限:ADMIN+
 *
 * 后续递补:Submission/User/Doc/Folder/Attachment 等业务表的 auditLog(见 src/lib/audit.ts paradigm)
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
  searchParams: { tab?: string; q?: string; from?: string; to?: string; actor?: string };
}) {
  await requireAdmin();

  const tab = searchParams.tab || 'task';
  const q = (searchParams.q || '').trim();
  const fromDate = searchParams.from ? new Date(searchParams.from) : null;
  const toDate = searchParams.to ? new Date(searchParams.to) : null;
  const actorFilter = (searchParams.actor || '').trim();

  // 并行查 5 张审计表 — 各 100 条 + 筛选
  const baseWhere = {
    createdAt: {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    },
  };

  // Task 操作
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

  // 凭证操作 (VoucherAuditLog — 表字段:changedById/byAi/beforeJson/afterJson)
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

  // AI 员工活动 (AiActivityLog)
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

  // 审批流转 (ApprovalInstance + relations)
  const approvalWhere: any = { ...baseWhere };
  if (q) {
    approvalWhere.title = { contains: q, mode: 'insensitive' };
  }
  // initiatorId 关联 User,actorFilter 走 initiator.email
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
          include: {
            approver: { select: { id: true, name: true, email: true } },
          },
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
          <h1 className="text-xl font-semibold text-slate-900">审计中心 · v1</h1>
          <div className="text-xs text-slate-500">
            最近 100 条/tab · 全量请用筛选缩范围
          </div>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          看板上"谁动过什么"统一入口。2026-06-29 上线 v1,涵盖 4 类:任务操作 / 凭证操作 / AI 员工活动 / 审批流转。
          其他业务对象(提交 / 用户 / 文件 / 部门)的留痕**正在递补**,以后这页会越来越全。
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
        initialFilters={{ q, from: searchParams.from || '', to: searchParams.to || '', actor: actorFilter }}
        data={{
          task: { rows: taskAudits, total: taskAuditTotal },
          voucher: { rows: voucherAudits, total: voucherAuditTotal },
          ai: { rows: aiActivities, total: aiActivityTotal },
          approval: { rows: approvals, total: approvalTotal },
        }}
      />
    </main>
  );
}
