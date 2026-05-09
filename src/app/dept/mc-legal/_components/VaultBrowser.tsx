'use client';

/**
 * MC 法务 vault 浏览器（thin wrapper）
 *
 * 把通用 VaultBrowser 配置成读 mc-legal-vault repo 根目录。
 * 单独 wrapper 是为了固定 apiPath 不让别处误用。
 */
import { VaultBrowser as GenericVaultBrowser } from '@/components/vault/VaultBrowser';

export function VaultBrowser() {
  return (
    <GenericVaultBrowser
      apiPath="/api/dept/mc-legal/vault-tree"
      repoUrl="https://github.com/lungtszyiu-creator/mc-legal-vault"
      emptyHint="mc-legal-vault repo 根目录为空（应该不会发生 — 检查 token / repo 状态）"
    />
  );
}
