/**
 * Vault GitHub Contents API client
 *
 * lty-vault 是 PRIVATE repo，不能用 raw URL 匿名拉。
 * 通过 GitHub Contents API + VAULT_GITHUB_TOKEN 拉 JSON 文件。
 *
 * 数据契约：见 vault repo 的 `_meta/SCHEMAS.md`。
 *
 * 失败处理：
 * - token 缺失 / 404 / 网络错误 → 返回 null（页面降级显示 EmptyHint）
 * - 不抛异常，看板永远能渲染
 */

const TOKEN = process.env.VAULT_GITHUB_TOKEN;
const OWNER = 'lungtszyiu-creator';
const REPO = 'lty-vault';
const BRANCH = 'main';

async function fetchVaultJson<T>(path: string): Promise<T | null> {
  if (!TOKEN) {
    console.warn(`[vault-client] VAULT_GITHUB_TOKEN missing, skipping ${path}`);
    return null;
  }
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github.raw',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.warn(`[vault-client] ${path} → HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`[vault-client] ${path} fetch error:`, e);
    return null;
  }
}

/** 拉文件 raw 文本（用于 markdown / 任意文件） */
async function fetchVaultText(path: string): Promise<string | null> {
  if (!TOKEN) {
    console.warn(`[vault-client] VAULT_GITHUB_TOKEN missing, skipping ${path}`);
    return null;
  }
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}?ref=${BRANCH}`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github.raw',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.warn(`[vault-client] ${path} → HTTP ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (e) {
    console.warn(`[vault-client] ${path} fetch error:`, e);
    return null;
  }
}

/** GitHub Contents API 目录返回项 */
interface GhDirEntry {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  html_url?: string;
}

/** 列目录（GitHub Contents API directory listing） */
async function fetchVaultDir(path: string): Promise<GhDirEntry[] | null> {
  if (!TOKEN) {
    console.warn(`[vault-client] VAULT_GITHUB_TOKEN missing, skipping dir ${path}`);
    return null;
  }
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}?ref=${BRANCH}`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.warn(`[vault-client] dir ${path} → HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json)) return null;
    return json as GhDirEntry[];
  } catch (e) {
    console.warn(`[vault-client] dir ${path} fetch error:`, e);
    return null;
  }
}

// ============ Schemas（与 _meta/SCHEMAS.md 对齐，见 vault commit 14213b3+）============

export interface DashboardJson {
  generated_at: string;
  vault: {
    wiki_pages: number;
    raw_files: number;
    decisions: number;
    broken_links: number;
    orphan_pages: number;
    pending_ingest: number;
  };
  scribe: {
    last_active: string | null;
    today_processed: number;
    today_archived: number;
    today_pending: number;
    current_model: string;
    recent_activity: Array<{
      at: string;
      action: string;
      file: string;
      final_path?: string;
      confidence?: number;
    }>;
  };
  inspector: {
    last_lint_run: string | null;
    next_scheduled: string | null;
    current_model: string;
  };
  curator: {
    last_ingest: { at: string; title: string; pages_touched: number } | null;
    this_week_ingests: number;
    this_month_ingests: number;
  };
  pending_user_action: {
    inbox_pending: number;
    lint_unresolved: number;
    unanswered_clarifications: number;
  };
}

export interface InboxQueueJson {
  updated_at: string;
  pending: Array<{
    path: string;
    summary: string;
    confidence: number;
    guessed_dept: string;
    processed_at: string;
    // 可选 v1.1 字段（仓库员可能没产，看板降级显示）
    guessed_type?: string;
    tags?: string[];
    source?: 'from_tg' | 'from_drive' | 'manual';
    file_type?: 'pdf' | 'image' | 'doc' | 'text';
    size_bytes?: number;
    proposed_final_path?: string;
  }>;
}

// ============ 公开 API ============

export async function getVaultDashboard(): Promise<DashboardJson | null> {
  return fetchVaultJson<DashboardJson>('_meta/dashboard.json');
}

export async function getVaultInboxQueue(): Promise<InboxQueueJson | null> {
  return fetchVaultJson<InboxQueueJson>('_meta/inbox_queue.json');
}

// ============ 财务月报 ============

export interface MonthlyReportEntry {
  yearMonth: string; // "2026-04"
  filename: string; // "2026-04.md"
  path: string; // vault path
  htmlUrl?: string; // GitHub web view URL
  size: number;
  sha: string;
}

export interface MonthlyReportContent {
  yearMonth: string;
  markdown: string;
  htmlUrl?: string;
}

const MONTHLY_REPORTS_DIR = 'raw/财务部/monthly_reports';

/** 列出所有月报，按月倒序 */
export async function listMonthlyReports(): Promise<MonthlyReportEntry[]> {
  const entries = await fetchVaultDir(MONTHLY_REPORTS_DIR);
  if (!entries) return [];
  return entries
    .filter((e) => e.type === 'file' && /^\d{4}-\d{2}\.md$/.test(e.name))
    .map((e) => ({
      yearMonth: e.name.replace(/\.md$/, ''),
      filename: e.name,
      path: e.path,
      htmlUrl: e.html_url,
      size: e.size,
      sha: e.sha,
    }))
    .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
}

/** 拉某月月报 markdown 内容 */
export async function getMonthlyReport(yearMonth: string): Promise<MonthlyReportContent | null> {
  // 校验格式 YYYY-MM 防注入
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return null;
  const path = `${MONTHLY_REPORTS_DIR}/${yearMonth}.md`;
  const md = await fetchVaultText(path);
  if (md === null) return null;
  return {
    yearMonth,
    markdown: md,
    htmlUrl: `https://github.com/${OWNER}/${REPO}/blob/${BRANCH}/${encodeURI(path)}`,
  };
}
