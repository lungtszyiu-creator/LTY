/**
 * 财务 entity → vault 双向同步
 *
 * 设计原则：审批通过的财务记录是 LTY 的"权威账本"，必须在 vault 里有副本，
 * 由仓库员（drudge daemon）扫到后做归档分类，给管家做后续 wiki 整合。
 *
 * 触发时机：
 * - Voucher.status: AI_DRAFT/BOSS_REVIEWING → POSTED  → archiveVoucher()
 * - ChainTransaction 入账（创建即归档，链上数据本身是事实）→ archiveChainTransaction()
 * - FxRate 创建（无审批，AI 抓汇率即归档）            → archiveFxRate()
 * - Reconciliation status: RESOLVED                  → archiveReconciliation()
 *
 * 同步是 fire-and-forget：失败不阻塞主响应，但记录 console.error。
 *
 * Vault 路径约定（与 raw/ 已有目录结构对齐）：
 *   raw/财务部/vouchers/V-YYYYMM-NNN.md          ← 凭证
 *   raw/财务部/chain_data/<chain>-<txhash[:10]>.md ← 链上交易
 *   raw/财务部/fx_rates/YYYY-MM-DD-<pair>.md     ← 汇率
 *   raw/财务部/reconciliations/YYYY-MM-<scope>.md ← 对账
 *
 * 写库后回填 prisma `vaultPath` 字段，UI 可显示"已同步"徽章。
 */
import type { Voucher, ChainTransaction, FxRate, Reconciliation } from '@prisma/client';
import { prisma } from './db';
import { writeToVault, getVaultFileSha, buildFrontmatter, type VaultWriteResult } from './vault-write';

// ---------- Voucher ----------

export async function archiveVoucher(v: Voucher): Promise<VaultWriteResult> {
  if (!v.voucherNumber) {
    return {
      ok: false,
      error: 'GITHUB_API_FAILED',
      githubResponse: 'voucherNumber missing — only POSTED voucher should be archived',
    };
  }
  const path = `raw/财务部/vouchers/${v.voucherNumber}.md`;
  const frontmatter = buildFrontmatter({
    kind: 'voucher',
    voucher_number: v.voucherNumber,
    date: v.date.toISOString().slice(0, 10),
    status: v.status,
    amount: v.amount.toString(),
    currency: v.currency,
    debit_account: v.debitAccount,
    credit_account: v.creditAccount,
    posted_at: v.postedAt?.toISOString() ?? null,
    posted_by: v.postedById ?? null,
    created_by_ai: v.createdByAi ?? null,
    approval_instance_id: v.approvalInstanceId ?? null,
    source: 'dashboard',
  });

  const body = [
    `# 凭证 ${v.voucherNumber}`,
    '',
    `**摘要**：${v.summary}`,
    '',
    `## 分录`,
    '',
    `| 借方科目 | 贷方科目 | 金额 | 币种 |`,
    `|---|---|---:|---|`,
    `| ${v.debitAccount} | ${v.creditAccount} | ${v.amount.toString()} | ${v.currency} |`,
    '',
    `## 元数据`,
    '',
    `- 凭证日期：${v.date.toISOString().slice(0, 10)}`,
    `- 状态：${v.status}`,
    v.postedAt ? `- 入账时间：${v.postedAt.toISOString()}` : '',
    v.createdByAi ? `- AI 起草：${v.createdByAi}` : '',
    v.approvalInstanceId ? `- 审批实例：${v.approvalInstanceId}` : '',
    '',
    '> 此文件由看板审批通过后自动归档，**不可在 vault 直接修改**。需要修正请回看板 VOID 后重开新凭证。',
  ]
    .filter(Boolean)
    .join('\n');

  const sha = await getVaultFileSha(path);
  const result = await writeToVault({
    path,
    content: frontmatter + body,
    commitMessage: `[voucher] ${v.voucherNumber} ${v.summary.slice(0, 60)}`,
    prevSha: sha ?? undefined,
  });

  // dry-run 不回填 vaultPath（不然 UI 会假装"已同步"但 GitHub 实际没文件）
  if (result.ok && !result.dryRun) {
    await prisma.voucher.update({
      where: { id: v.id },
      data: { vaultPath: result.path },
    }).catch((e) => console.error('[vault-sync] voucher vaultPath update failed:', e));
  }
  return result;
}

// ---------- ChainTransaction ----------

export async function archiveChainTransaction(tx: ChainTransaction): Promise<VaultWriteResult> {
  const txShort = tx.txHash.slice(0, 10);
  const path = `raw/财务部/chain_data/${tx.chain.toLowerCase()}-${txShort}.md`;
  const frontmatter = buildFrontmatter({
    kind: 'chain_transaction',
    chain: tx.chain,
    tx_hash: tx.txHash,
    timestamp: tx.timestamp.toISOString(),
    from_address: tx.fromAddress,
    to_address: tx.toAddress,
    from_wallet_id: tx.fromWalletId ?? null,
    to_wallet_id: tx.toWalletId ?? null,
    amount: tx.amount.toString(),
    token: tx.token,
    token_contract: tx.tokenContract ?? null,
    is_reconciled: tx.isReconciled,
    tag: tx.tag ?? null,
    created_by_ai: tx.createdByAi ?? null,
    source: 'dashboard',
  });

  const body = [
    `# 链上交易 ${tx.chain} ${txShort}…`,
    '',
    `**${tx.amount.toString()} ${tx.token}** · ${tx.timestamp.toISOString()}`,
    '',
    `\`${tx.fromAddress}\``,
    `↓`,
    `\`${tx.toAddress}\``,
    '',
    tx.tag ? `Tag: ${tx.tag}` : '',
    tx.notes ? `\n备注：${tx.notes}` : '',
    `\nTx Hash：\`${tx.txHash}\``,
    '',
    '> 看板归档自动生成。链上数据本身不可篡改，本文件仅做 vault 镜像。',
  ]
    .filter(Boolean)
    .join('\n');

  const sha = await getVaultFileSha(path);
  const result = await writeToVault({
    path,
    content: frontmatter + body,
    commitMessage: `[chain_tx] ${tx.chain} ${txShort} ${tx.amount.toString()} ${tx.token}`,
    prevSha: sha ?? undefined,
  });

  // dry-run 不回填 vaultPath（不然 UI 会假装"已同步"但 GitHub 实际没文件）
  if (result.ok && !result.dryRun) {
    await prisma.chainTransaction.update({
      where: { id: tx.id },
      data: { vaultPath: result.path },
    }).catch((e) => console.error('[vault-sync] chain_tx vaultPath update failed:', e));
  }
  return result;
}

// ---------- FxRate ----------

export async function archiveFxRate(r: FxRate): Promise<VaultWriteResult> {
  const dateStr = r.date.toISOString().slice(0, 10);
  const pairSlug = r.pair.replace(/[^A-Za-z0-9]+/g, '-');
  const path = `raw/财务部/fx_rates/${dateStr}-${pairSlug}.md`;
  const frontmatter = buildFrontmatter({
    kind: 'fx_rate',
    pair: r.pair,
    rate: r.rate.toString(),
    date: dateStr,
    source: r.source,
    is_official: r.isOfficial,
    notes: r.notes ?? null,
    created_by_ai: r.createdByAi ?? null,
  });

  const body = [
    `# 汇率 ${r.pair} · ${dateStr}`,
    '',
    `**1 单位 ${r.pair.split('/')[0]} = ${r.rate.toString()} ${r.pair.split('/')[1] ?? ''}**`,
    '',
    `数据源：${r.source}${r.isOfficial ? '（官方）' : ''}`,
    r.notes ? `\n备注：${r.notes}` : '',
    r.createdByAi ? `\nAI：${r.createdByAi}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const sha = await getVaultFileSha(path);
  // FxRate 没有 vaultPath 字段（schema 里看到 model 没有），跳过回填。
  return writeToVault({
    path,
    content: frontmatter + body,
    commitMessage: `[fx_rate] ${r.pair} ${dateStr} = ${r.rate.toString()} (${r.source})`,
    prevSha: sha ?? undefined,
  });
}

// ---------- Reconciliation ----------

export async function archiveReconciliation(rec: Reconciliation): Promise<VaultWriteResult> {
  const slug = rec.scope.toLowerCase();
  const path = `raw/财务部/reconciliations/${rec.period}-${slug}.md`;
  const frontmatter = buildFrontmatter({
    kind: 'reconciliation',
    period: rec.period,
    scope: rec.scope,
    status: rec.status,
    bank_total: rec.bankTotal?.toString() ?? null,
    chain_total: rec.chainTotal?.toString() ?? null,
    ledger_total: rec.ledgerTotal?.toString() ?? null,
    diff_amount: rec.diffAmount?.toString() ?? null,
    diff_currency: rec.diffCurrency ?? null,
    closed_at: rec.closedAt?.toISOString() ?? null,
    created_by_ai: rec.createdByAi ?? null,
    source: 'dashboard',
  });

  const body = [
    `# 对账报告 ${rec.period} · ${rec.scope}`,
    '',
    `**状态**：${rec.status}${rec.closedAt ? `（关闭于 ${rec.closedAt.toISOString().slice(0, 10)}）` : ''}`,
    '',
    `## 三方总额`,
    '',
    `| 来源 | 金额 |`,
    `|---|---:|`,
    rec.bankTotal ? `| 银行流水合计 | ${rec.bankTotal.toString()} |` : '',
    rec.chainTotal ? `| 链上交易合计 | ${rec.chainTotal.toString()} |` : '',
    rec.ledgerTotal ? `| 账面合计 | ${rec.ledgerTotal.toString()} |` : '',
    '',
    rec.diffAmount
      ? `**差额**：${rec.diffAmount.toString()} ${rec.diffCurrency ?? ''}`
      : '',
    rec.resolutionNote ? `\n## 处理说明\n\n${rec.resolutionNote}` : '',
    '',
    '> 看板对账员产出，老板审过 RESOLVED 后归档。',
  ]
    .filter(Boolean)
    .join('\n');

  const sha = await getVaultFileSha(path);
  const result = await writeToVault({
    path,
    content: frontmatter + body,
    commitMessage: `[reconciliation] ${rec.period} ${rec.scope} ${rec.status}`,
    prevSha: sha ?? undefined,
  });

  // dry-run 不回填 vaultPath（不然 UI 会假装"已同步"但 GitHub 实际没文件）
  if (result.ok && !result.dryRun) {
    await prisma.reconciliation.update({
      where: { id: rec.id },
      data: { vaultPath: result.path },
    }).catch((e) => console.error('[vault-sync] reconciliation vaultPath update failed:', e));
  }
  return result;
}

// ---------- 包装：异步 fire-and-forget ----------

/**
 * 审批 hook：触发同步但不阻塞主响应。
 * 失败仅 console.error，不影响主流程。
 */
export function fireAndForgetArchive<T>(
  archiveFn: (entity: T) => Promise<VaultWriteResult>,
  entity: T,
  label: string,
): void {
  archiveFn(entity)
    .then((result) => {
      if (!result.ok) {
        console.error(`[vault-sync] ${label} archive failed:`, result.error, 'githubResponse' in result ? result.githubResponse : '');
      } else if (result.dryRun) {
        console.log(`[vault-sync] ${label} DRY-RUN (VAULT_SYNC_ENABLED!=true) → would write ${result.path}`);
      } else {
        console.log(`[vault-sync] ${label} archived → ${result.path} (sha=${result.commitSha})`);
      }
    })
    .catch((err) => {
      console.error(`[vault-sync] ${label} archive crashed:`, err);
    });
}
