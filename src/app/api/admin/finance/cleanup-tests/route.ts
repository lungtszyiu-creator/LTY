/**
 * 清理测试数据 API（仅老板用）
 *
 * POST /api/admin/finance/cleanup-tests
 * Body: { confirm: true, dryRun?: boolean }
 *
 * 删除规则（同时匹配下面任一条件即视为测试数据）：
 *   - Voucher: summary 以 "TEST" 开头 或 包含 "connectivity check"
 *   - ChainTransaction: txHash 以 "0xTEST_" 开头
 *   - FxRate: source = "TEST"
 *   - Reconciliation: resolutionNote 包含 "TEST" 或 "connectivity check"
 *
 * 删除前会把 AiActivityLog 里指向这些记录的 FK 置 null（保留审计痕迹）。
 *
 * dryRun=true 时只返回会删多少条，不真删。
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFinanceEditSession } from '@/lib/finance-access';

const TEST_VOUCHER_FILTER = {
  OR: [
    { summary: { startsWith: 'TEST' } },
    { summary: { contains: 'connectivity check' } },
  ],
};

const TEST_CHAIN_TX_FILTER = {
  txHash: { startsWith: '0xTEST_' },
};

const TEST_FX_FILTER = {
  source: 'TEST',
};

const TEST_RECON_FILTER = {
  OR: [
    { resolutionNote: { contains: 'TEST' } },
    { resolutionNote: { contains: 'connectivity check' } },
  ],
};

export async function POST(req: NextRequest) {
  // 仅 EDITOR（老板 SUPER_ADMIN 自动 EDITOR）
  const auth = await requireFinanceEditSession();
  if (auth instanceof NextResponse) return auth;

  let body: { confirm?: boolean; dryRun?: boolean };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (!body.confirm && !body.dryRun) {
    return NextResponse.json(
      { error: 'CONFIRM_REQUIRED', message: 'Pass {"confirm": true} or {"dryRun": true}.' },
      { status: 400 },
    );
  }

  // 先 count 各表的待清理数量
  const [voucherCount, chainTxCount, fxRateCount, reconCount] = await Promise.all([
    prisma.voucher.count({ where: TEST_VOUCHER_FILTER }),
    prisma.chainTransaction.count({ where: TEST_CHAIN_TX_FILTER }),
    prisma.fxRate.count({ where: TEST_FX_FILTER }),
    prisma.reconciliation.count({ where: TEST_RECON_FILTER }),
  ]);

  const counts = {
    vouchers: voucherCount,
    chainTransactions: chainTxCount,
    fxRates: fxRateCount,
    reconciliations: reconCount,
    total: voucherCount + chainTxCount + fxRateCount + reconCount,
  };

  if (body.dryRun) {
    return NextResponse.json({ dryRun: true, wouldDelete: counts });
  }

  // 实删：先收集 ID，把 AiActivityLog 的 FK 解开，再删父表
  const result = await prisma.$transaction(async (tx) => {
    const [voucherIds, chainTxIds, fxRateIds, reconIds] = await Promise.all([
      tx.voucher.findMany({ where: TEST_VOUCHER_FILTER, select: { id: true } }),
      tx.chainTransaction.findMany({ where: TEST_CHAIN_TX_FILTER, select: { id: true } }),
      tx.fxRate.findMany({ where: TEST_FX_FILTER, select: { id: true } }),
      tx.reconciliation.findMany({ where: TEST_RECON_FILTER, select: { id: true } }),
    ]);

    // 解开 AiActivityLog 的 FK（不删 log，保留审计）
    await Promise.all([
      voucherIds.length > 0 &&
        tx.aiActivityLog.updateMany({
          where: { voucherId: { in: voucherIds.map((v) => v.id) } },
          data: { voucherId: null },
        }),
      chainTxIds.length > 0 &&
        tx.aiActivityLog.updateMany({
          where: { chainTransactionId: { in: chainTxIds.map((v) => v.id) } },
          data: { chainTransactionId: null },
        }),
      fxRateIds.length > 0 &&
        tx.aiActivityLog.updateMany({
          where: { fxRateId: { in: fxRateIds.map((v) => v.id) } },
          data: { fxRateId: null },
        }),
      reconIds.length > 0 &&
        tx.aiActivityLog.updateMany({
          where: { reconciliationId: { in: reconIds.map((v) => v.id) } },
          data: { reconciliationId: null },
        }),
    ]);

    // ChainTransaction 有指向 Reconciliation 的 FK，先把 reconciliationId 解开
    if (reconIds.length > 0) {
      await tx.chainTransaction.updateMany({
        where: { reconciliationId: { in: reconIds.map((v) => v.id) } },
        data: { reconciliationId: null },
      });
    }

    // 真删
    const [deletedVouchers, deletedChainTxs, deletedFxRates, deletedRecons] = await Promise.all([
      tx.voucher.deleteMany({ where: TEST_VOUCHER_FILTER }),
      tx.chainTransaction.deleteMany({ where: TEST_CHAIN_TX_FILTER }),
      tx.fxRate.deleteMany({ where: TEST_FX_FILTER }),
      tx.reconciliation.deleteMany({ where: TEST_RECON_FILTER }),
    ]);

    return {
      vouchers: deletedVouchers.count,
      chainTransactions: deletedChainTxs.count,
      fxRates: deletedFxRates.count,
      reconciliations: deletedRecons.count,
      total: deletedVouchers.count + deletedChainTxs.count + deletedFxRates.count + deletedRecons.count,
    };
  });

  return NextResponse.json({ deleted: result, _by: auth.userId });
}
