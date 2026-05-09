/**
 * 钱包地址 dedup + normalize 小写
 *
 * Why: ETH 地址 EIP-55 是 mixed-case checksum 格式，但底层是同一个地址。
 * 看板的 Postgres unique constraint (chain, address) 是 case-sensitive，
 * 所以 `0x1B3A...F7FE` 和 `0x1b3a...f7fe` 在 DB 里被认为两条不同记录。
 *
 * 本 endpoint 一次性扫描 + 合并 + 归一化:
 *   1. 找 (chain, lower(address)) 重复的 CryptoWallet
 *   2. 选一条 canonical（优先 vaultPath 不为空的；其次 createdAt 最早）
 *   3. 把 non-canonical 的 ChainTransaction (fromWalletId/toWalletId) +
 *      WalletBalanceSnapshot (walletId) 关联 transfer 到 canonical
 *   4. 删 non-canonical 行
 *   5. 所有剩余行 address 转小写
 *
 * dryRun=true (默认) 只报告，不写库。
 *
 * 鉴权: 仅 SUPER_ADMIN — 数据合并是 destructive，普通 ADMIN 不放行。
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/permissions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const admin = await requireSuperAdmin();
  const body = await req.json().catch(() => ({}));
  const dryRun: boolean = body?.dryRun !== false; // 默认 true

  const allWallets = await prisma.cryptoWallet.findMany({
    select: {
      id: true,
      chain: true,
      address: true,
      vaultPath: true,
      label: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  // 按 (chain, lowercase address) 分组
  const groups = new Map<string, typeof allWallets>();
  for (const w of allWallets) {
    const key = `${w.chain}:${w.address.toLowerCase()}`;
    const arr = groups.get(key) ?? [];
    arr.push(w);
    groups.set(key, arr);
  }

  const merges: {
    keptId: string;
    keptLabel: string;
    canonicalAddress: string;
    deletedIds: string[];
    txTransferred: number;
    snapshotsTransferred: number;
  }[] = [];
  const lowercased: { id: string; oldAddress: string; newAddress: string }[] = [];
  const errors: string[] = [];

  for (const [, group] of groups) {
    if (group.length === 1) {
      // 单条没重复，但可能 address 有大写 → 统一小写
      const w = group[0];
      const lower = w.address.toLowerCase();
      if (lower !== w.address) {
        lowercased.push({ id: w.id, oldAddress: w.address, newAddress: lower });
        if (!dryRun) {
          try {
            await prisma.cryptoWallet.update({
              where: { id: w.id },
              data: { address: lower },
            });
          } catch (e) {
            errors.push(
              `${w.id} (${w.label}) lowercase 失败: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
      }
      continue;
    }

    // 多条重复 → 选 canonical
    // 优先级: vaultPath !== null > createdAt 最早
    const sorted = [...group].sort((a, b) => {
      const aVault = a.vaultPath ? 0 : 1;
      const bVault = b.vaultPath ? 0 : 1;
      if (aVault !== bVault) return aVault - bVault;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const canonical = sorted[0];
    const losers = sorted.slice(1);
    const canonicalAddress = canonical.address.toLowerCase();

    let txCount = 0;
    let snapshotCount = 0;

    if (!dryRun) {
      try {
        await prisma.$transaction(async (tx) => {
          for (const loser of losers) {
            // transfer ChainTransaction.fromWalletId
            const txFromUpd = await tx.chainTransaction.updateMany({
              where: { fromWalletId: loser.id },
              data: { fromWalletId: canonical.id },
            });
            const txToUpd = await tx.chainTransaction.updateMany({
              where: { toWalletId: loser.id },
              data: { toWalletId: canonical.id },
            });
            txCount += txFromUpd.count + txToUpd.count;
            // transfer WalletBalanceSnapshot.walletId
            const snapUpd = await tx.walletBalanceSnapshot.updateMany({
              where: { walletId: loser.id },
              data: { walletId: canonical.id },
            });
            snapshotCount += snapUpd.count;
            // delete loser
            await tx.cryptoWallet.delete({ where: { id: loser.id } });
          }
          // canonical address 统一小写
          if (canonical.address !== canonicalAddress) {
            await tx.cryptoWallet.update({
              where: { id: canonical.id },
              data: { address: canonicalAddress },
            });
          }
        });
      } catch (e) {
        errors.push(
          `合并 ${canonical.label} (${canonical.id}) 失败: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    } else {
      // dry-run: 只统计
      for (const loser of losers) {
        const [txFrom, txTo, snap] = await Promise.all([
          prisma.chainTransaction.count({ where: { fromWalletId: loser.id } }),
          prisma.chainTransaction.count({ where: { toWalletId: loser.id } }),
          prisma.walletBalanceSnapshot.count({ where: { walletId: loser.id } }),
        ]);
        txCount += txFrom + txTo;
        snapshotCount += snap;
      }
    }

    merges.push({
      keptId: canonical.id,
      keptLabel: canonical.label,
      canonicalAddress,
      deletedIds: losers.map((l) => l.id),
      txTransferred: txCount,
      snapshotsTransferred: snapshotCount,
    });
  }

  // 写一行 audit log（仅真跑）
  if (!dryRun) {
    await prisma.aiActivityLog.create({
      data: {
        aiRole: 'system',
        action: 'wallet_dedup_normalize',
        status: errors.length > 0 ? 'failed' : 'success',
        payload: JSON.stringify({
          merges: merges.length,
          lowercased: lowercased.length,
          errors,
          triggeredBy: admin.id,
        }),
        dashboardWritten: true,
      },
    });
  }

  return NextResponse.json({
    ok: errors.length === 0,
    dryRun,
    summary: {
      totalWallets: allWallets.length,
      duplicateGroups: merges.length,
      lonelyWalletsLowercased: lowercased.length,
      txTransferred: merges.reduce((s, m) => s + m.txTransferred, 0),
      snapshotsTransferred: merges.reduce((s, m) => s + m.snapshotsTransferred, 0),
      errorsCount: errors.length,
    },
    merges,
    lowercased,
    errors,
  });
}
