/**
 * AI 活动日志辅助
 *
 * 任何 AI 调财务 API 时调用 logAiActivity，把动作落到 AiActivityLog 表。
 * 这是看板"今日活动流"的数据来源，也是审计回溯的依据。
 */
import { prisma } from './db';

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
