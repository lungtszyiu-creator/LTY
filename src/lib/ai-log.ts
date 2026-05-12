/**
 * AI 活动日志辅助
 *
 * 任何 AI 调财务 API 时调用 logAiActivity，把动作落到 AiActivityLog 表。
 * 这是看板"今日活动流"的数据来源，也是审计回溯的依据。
 */
import { prisma } from './db';
import { startOfTodayHk, endOfTodayHk } from './budget';
import type { ActivityRow } from '@/components/ai-dashboard/AiActivityFeed';

export type AiActivityInput = {
  aiRole: string;             // "voucher_clerk" | "chain_bookkeeper" | ...
  action: string;             // "create_voucher" | "log_chain_tx" | ...
  status?: 'success' | 'failed' | 'pending';
  payload?: unknown;          // 输入摘要，会 JSON 化
  errorMessage?: string;
  apiKeyId?: string;          // 来自 requireApiKey 返回的 ctx.apiKeyId
  // 关联到具体业务记录（任意一个或多个）
  voucherId?: string;
  chainTransactionId?: string;
  reconciliationId?: string;
  fxRateId?: string;
  // 三向分发追踪
  telegramSent?: boolean;
  vaultWritten?: boolean;
};

export async function logAiActivity(input: AiActivityInput): Promise<string> {
  const log = await prisma.aiActivityLog.create({
    data: {
      aiRole: input.aiRole,
      action: input.action,
      status: input.status ?? 'success',
      payload: input.payload ? JSON.stringify(input.payload) : null,
      errorMessage: input.errorMessage,
      apiKeyId: input.apiKeyId,
      voucherId: input.voucherId,
      chainTransactionId: input.chainTransactionId,
      reconciliationId: input.reconciliationId,
      fxRateId: input.fxRateId,
      telegramSent: input.telegramSent ?? false,
      vaultWritten: input.vaultWritten ?? false,
      dashboardWritten: true, // 调本 helper 即代表已落看板
    },
  });
  return log.id;
}

/**
 * 取近 N 条活动用于看板"活动流"显示。
 */
export async function getRecentAiActivity(limit: number = 50) {
  return prisma.aiActivityLog.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      apiKey: { select: { name: true, scope: true } },
    },
  });
}

/**
 * 部门看板今日 AI 工作日记数据源。
 *
 * 老板 5/13：行政部 AI 自己上报的活动应在 /dept/admin 显示（不止 /dept/ai）。
 * 按 AI 员工 deptSlug 过滤 —— 一个看板可对应多个 deptSlug（例如财务出纳看板
 * 可能要同时显示 'finance' 与 'cashier'），所以传数组。
 *
 * 返回已序列化好的 ActivityRow[]（Date → ISO），server component 拿到直接
 * 传给 <AiActivityFeed rows={...} />，跟 /dept/ai 同款数据形状。
 */
export async function getDeptAiActivitiesToday(
  deptSlugs: string[],
  opts: { take?: number } = {},
): Promise<ActivityRow[]> {
  if (deptSlugs.length === 0) return [];
  const rows = await prisma.aiActivityLog.findMany({
    where: {
      createdAt: { gte: startOfTodayHk(), lt: endOfTodayHk() },
      apiKey: {
        is: {
          aiEmployee: { is: { deptSlug: { in: deptSlugs } } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: opts.take ?? 200,
    include: {
      apiKey: {
        select: {
          name: true,
          aiEmployee: { select: { name: true, role: true } },
        },
      },
    },
  });
  return rows.map((a) => ({
    id: a.id,
    aiRole: a.aiRole,
    action: a.action,
    status: a.status,
    payload: a.payload,
    voucherId: a.voucherId,
    chainTransactionId: a.chainTransactionId,
    fxRateId: a.fxRateId,
    reconciliationId: a.reconciliationId,
    telegramSent: a.telegramSent,
    vaultWritten: a.vaultWritten,
    createdAt: a.createdAt.toISOString(),
    employeeName: a.apiKey?.aiEmployee?.name ?? null,
    employeeRole: a.apiKey?.aiEmployee?.role ?? null,
    apiKeyName: a.apiKey?.name ?? null,
  }));
}
