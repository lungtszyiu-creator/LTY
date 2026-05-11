/**
 * 凭证操作审计辅助函数。
 *
 * 任何对凭证的 create / edit / approve / reject / void / delete 都通过
 * writeVoucherAudit 写一条 VoucherAuditLog 记录，老板与出纳都可在凭证详情页看
 * 完整时间线。
 */
import { prisma } from './db';

export type VoucherAuditAction =
  | 'create'
  | 'edit'
  | 'approve'
  | 'reject'
  | 'void'
  | 'delete';

export async function writeVoucherAudit(opts: {
  voucherId: string;
  action: VoucherAuditAction;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  changedById?: string | null;
  byAi?: string | null;
  reason?: string | null;
}): Promise<void> {
  try {
    await prisma.voucherAuditLog.create({
      data: {
        voucherId: opts.voucherId,
        action: opts.action,
        changedById: opts.changedById ?? null,
        byAi: opts.byAi ?? null,
        beforeJson: opts.before ? JSON.stringify(opts.before) : null,
        afterJson: opts.after ? JSON.stringify(opts.after) : null,
        reason: opts.reason ?? null,
      },
    });
  } catch (e) {
    // audit log 失败不阻塞主操作，但记录到 console
    console.error('[voucher-audit] write failed', e);
  }
}

/**
 * 比较 edit 操作的 before / after，只保留实际变更的字段。
 * 用法：beforeChanged + afterChanged 写入 audit log。
 */
export function diffVoucherFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const a = before[key];
    const b = after[key];
    // Decimal / Date 转 string 后比对
    const sa = a instanceof Date ? a.toISOString() : a?.toString?.() ?? a;
    const sb = b instanceof Date ? b.toISOString() : b?.toString?.() ?? b;
    if (sa !== sb) {
      changedBefore[key] = sa;
      changedAfter[key] = sb;
    }
  }
  if (Object.keys(changedAfter).length === 0) return null;
  return { before: changedBefore, after: changedAfter };
}
