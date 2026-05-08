/**
 * Vault GitHub 写入器（通用）
 *
 * 把任意路径的 markdown / yaml 写入 lty-vault repo。
 * 抽出自 src/app/api/finance/vault-archive/route.ts 的核心逻辑，
 * 让看板各审批 hook（voucher / chain tx / fx rate / reconciliation）
 * 能直接调用 lib 而不用反向 fetch 自己的 API。
 *
 * 环境变量：
 * - GITHUB_VAULT_TOKEN：GitHub fine-grained PAT（必需）
 * - VAULT_SYNC_ENABLED：'true' 才真的写 GitHub；其他值（含未设置）= **dry-run 不写**
 *   ↑ 老板要求：避免测试数据污染生产 vault，默认关闭，部署时显式打开
 */

const VAULT_OWNER = 'lungtszyiu-creator';
const VAULT_REPO = 'lty-vault';

export type VaultWriteResult =
  | {
      ok: true;
      path: string;
      commitSha: string | null;
      contentSha: string | null;
      htmlUrl: string | null;
      dryRun?: boolean;
    }
  | {
      ok: false;
      error: 'VAULT_TOKEN_NOT_CONFIGURED' | 'GITHUB_API_FAILED' | 'VAULT_SYNC_DISABLED';
      status?: number;
      githubResponse?: string;
    };

/** vault 同步是否启用。默认关（避免测试数据污染生产 vault）。*/
export function isVaultSyncEnabled(): boolean {
  return process.env.VAULT_SYNC_ENABLED === 'true';
}

export interface VaultWriteOptions {
  /** 仓内绝对路径，如 `raw/财务部/vouchers/V-202604-001.md` */
  path: string;
  /** 完整文件内容（已含 frontmatter）*/
  content: string;
  /** Commit message，如 `[voucher] V-202604-001 已审批` */
  commitMessage: string;
  /** 如果文件已存在，提供旧 sha 用于 update（不提供 = 新建）*/
  prevSha?: string;
}

/** 直接把 markdown / yaml 写入 lty-vault GitHub repo。
 *
 * **默认 dry-run** — 如果 VAULT_SYNC_ENABLED 不是 'true'，不写 GitHub，只 console.log。
 * 防止测试期间污染真实 vault 数据。
 */
export async function writeToVault(opts: VaultWriteOptions): Promise<VaultWriteResult> {
  // dry-run：不真写 GitHub，方便在测试环境跑
  if (!isVaultSyncEnabled()) {
    console.log(`[vault-write DRY-RUN] would PUT ${opts.path} (${opts.content.length} bytes) — set VAULT_SYNC_ENABLED=true to actually write`);
    return {
      ok: true,
      path: opts.path,
      commitSha: null,
      contentSha: null,
      htmlUrl: null,
      dryRun: true,
    };
  }
  const token = process.env.GITHUB_VAULT_TOKEN;
  if (!token) {
    return { ok: false, error: 'VAULT_TOKEN_NOT_CONFIGURED' };
  }

  const apiUrl = `https://api.github.com/repos/${VAULT_OWNER}/${VAULT_REPO}/contents/${encodeURIComponent(opts.path).replace(/%2F/g, '/')}`;
  const contentBase64 = Buffer.from(opts.content, 'utf8').toString('base64');

  const ghResp = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: opts.commitMessage,
      content: contentBase64,
      ...(opts.prevSha ? { sha: opts.prevSha } : {}),
    }),
  });

  if (!ghResp.ok) {
    const errBody = await ghResp.text();
    return {
      ok: false,
      error: 'GITHUB_API_FAILED',
      status: ghResp.status,
      githubResponse: errBody.slice(0, 500),
    };
  }

  const ghJson = (await ghResp.json()) as {
    content?: { sha?: string; path?: string; html_url?: string };
    commit?: { sha?: string; html_url?: string };
  };

  return {
    ok: true,
    path: opts.path,
    commitSha: ghJson.commit?.sha ?? null,
    contentSha: ghJson.content?.sha ?? null,
    htmlUrl: ghJson.content?.html_url ?? null,
  };
}

/** 读取 vault 某文件当前 sha（用于 update）。文件不存在返回 null。
 * dry-run 时直接返回 null（reader 也不打 GitHub）。
 */
export async function getVaultFileSha(path: string): Promise<string | null> {
  if (!isVaultSyncEnabled()) return null;
  const token = process.env.GITHUB_VAULT_TOKEN;
  if (!token) return null;
  const apiUrl = `https://api.github.com/repos/${VAULT_OWNER}/${VAULT_REPO}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
  const resp = await fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as { sha?: string };
  return data.sha ?? null;
}

/** 工具：把 markdown 内容前面包一层 YAML frontmatter。*/
export function buildFrontmatter(meta: Record<string, string | number | boolean | null | undefined>): string {
  const lines = ['---'];
  for (const [k, v] of Object.entries(meta)) {
    if (v === null || v === undefined) continue;
    const escaped = typeof v === 'string' ? v.replace(/"/g, '\\"') : String(v);
    lines.push(`${k}: ${typeof v === 'string' && /[:\n#]/.test(escaped) ? `"${escaped}"` : escaped}`);
  }
  lines.push('---');
  return lines.join('\n') + '\n';
}
