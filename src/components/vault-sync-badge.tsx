/**
 * Vault 同步徽章
 *
 * 用法：
 *   <VaultSyncBadge vaultPath={voucher.vaultPath} />
 *   <VaultSyncBadge vaultPath={chainTx.vaultPath} hideWhenMissing />
 *
 * 状态：
 * - vaultPath 有值 → 绿色 ✓ 已同步
 * - vaultPath 空 + hideWhenMissing → 不显示
 * - vaultPath 空 + 默认 → 灰色 — 待同步
 */
import Link from 'next/link';

const VAULT_REPO_URL = 'https://github.com/lungtszyiu-creator/lty-vault/blob/main';

export function VaultSyncBadge({
  vaultPath,
  hideWhenMissing,
}: {
  vaultPath: string | null | undefined;
  hideWhenMissing?: boolean;
}) {
  if (!vaultPath) {
    if (hideWhenMissing) return null;
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500"
        title="尚未同步到知识库 vault（可能正在 dry-run，或归档失败 — 见 server log）"
      >
        — 待同步
      </span>
    );
  }
  return (
    <Link
      href={`${VAULT_REPO_URL}/${vaultPath}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
      title={`已同步到 vault：${vaultPath}（点击在 GitHub 查看）`}
    >
      <span aria-hidden>✓</span>
      <span>已同步 vault</span>
    </Link>
  );
}
