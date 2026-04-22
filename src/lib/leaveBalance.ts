import { prisma } from './db';

export type LeavePool = 'ANNUAL' | 'COMP';
export type LedgerSource =
  | 'ADMIN_SET'
  | 'LEAVE_APPROVED'
  | 'OVERTIME_APPROVED'
  | 'ADMIN_ADJUST'
  | 'ROLLBACK';

export const LEDGER_SOURCE_LABEL: Record<LedgerSource, string> = {
  ADMIN_SET:         '管理员设置',
  ADMIN_ADJUST:      '管理员调整',
  LEAVE_APPROVED:    '请假通过 · 扣除',
  OVERTIME_APPROVED: '加班通过 · 入账',
  ROLLBACK:          '撤销回滚',
};

export const POOL_FOR_CATEGORY: Record<string, LeavePool | null> = {
  '年假':   'ANNUAL',
  '调休':   'COMP',
  '事假':   null,
  '病假':   null,
  '婚假':   null,
  '丧假':   null,
  '产假':   null,
  '陪护假': null,
  '其他':   null,
};

// Apply a signed delta to a user's balance pool in a single transaction and
// write a ledger entry describing why. approvalInstanceId is required for
// auto-deductions/credits so a re-run of the terminal hook can't double
// apply — the (approvalInstanceId, pool) unique constraint on
// LeaveBalanceLedger catches the replay.
export async function adjustLeaveBalance(args: {
  userId: string;
  pool: LeavePool;
  deltaDays: number;
  source: LedgerSource;
  note?: string | null;
  approvalInstanceId?: string | null;
  actorId?: string | null;
}): Promise<{ balanceAfter: number; skipped?: boolean }> {
  if (!args.deltaDays) return { balanceAfter: 0, skipped: true };

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: args.userId },
        select: { annualLeaveBalance: true, compLeaveBalance: true },
      });
      if (!user) throw new Error('USER_NOT_FOUND');
      const current = args.pool === 'ANNUAL' ? user.annualLeaveBalance : user.compLeaveBalance;
      const after = +(current + args.deltaDays).toFixed(2);

      await tx.user.update({
        where: { id: args.userId },
        data: args.pool === 'ANNUAL' ? { annualLeaveBalance: after } : { compLeaveBalance: after },
      });

      await tx.leaveBalanceLedger.create({
        data: {
          userId: args.userId,
          pool: args.pool,
          deltaDays: args.deltaDays,
          balanceAfter: after,
          source: args.source,
          note: args.note ?? null,
          approvalInstanceId: args.approvalInstanceId ?? null,
          actorId: args.actorId ?? null,
        },
      });

      return { balanceAfter: after };
    });
  } catch (e: any) {
    // Replay guard — unique (approvalInstanceId, pool) makes a re-fire of
    // the terminal hook a no-op instead of double-applying.
    if (e?.code === 'P2002' && args.approvalInstanceId) {
      return { balanceAfter: 0, skipped: true };
    }
    throw e;
  }
}

// Admin sets an absolute value (not a delta). Computes the delta and writes
// a ledger entry sourced as ADMIN_SET so the balance sheet shows "set to X"
// rather than a mysterious +N adjustment.
export async function setLeaveBalance(args: {
  userId: string;
  pool: LeavePool;
  newValue: number;
  actorId: string;
  note?: string | null;
}): Promise<{ balanceAfter: number }> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: args.userId },
      select: { annualLeaveBalance: true, compLeaveBalance: true },
    });
    if (!user) throw new Error('USER_NOT_FOUND');
    const current = args.pool === 'ANNUAL' ? user.annualLeaveBalance : user.compLeaveBalance;
    const delta = +(args.newValue - current).toFixed(2);
    const after = +args.newValue.toFixed(2);

    await tx.user.update({
      where: { id: args.userId },
      data: args.pool === 'ANNUAL' ? { annualLeaveBalance: after } : { compLeaveBalance: after },
    });

    if (delta !== 0) {
      await tx.leaveBalanceLedger.create({
        data: {
          userId: args.userId,
          pool: args.pool,
          deltaDays: delta,
          balanceAfter: after,
          source: 'ADMIN_SET',
          note: args.note ?? null,
          actorId: args.actorId,
        },
      });
    }

    return { balanceAfter: after };
  });
}
