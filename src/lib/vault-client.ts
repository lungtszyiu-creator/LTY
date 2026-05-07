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

// ============ 财务 / 运营 报告（统一 5 类） ============
//
// 5 类报告 + vault 路径约定（cron 各自写 markdown 到这些目录）：
//   financial-monthly:   raw/财务部/monthly_reports/YYYY-MM.md
//   financial-quarterly: raw/财务部/quarterly_reports/YYYY-Q[1-4].md
//   financial-annual:    raw/财务部/annual_reports/YYYY.md
//   ops-quarterly:       raw/财务部/ops_quarterly/YYYY-Q[1-4].md
//   ops-annual:          raw/财务部/ops_annual/YYYY.md
//
// 兼容：原 listMonthlyReports / getMonthlyReport 保留作 financial-monthly 的别名。

export type ReportCategory =
  | 'financial-monthly'
  | 'financial-quarterly'
  | 'financial-annual'
  | 'ops-quarterly'
  | 'ops-annual';

export const REPORT_CATEGORY_META: Record<
  ReportCategory,
  { label: string; dir: string; keyRegex: RegExp; period: 'monthly' | 'quarterly' | 'annual'; type: 'financial' | 'ops' }
> = {
  'financial-monthly': {
    label: '财务月报',
    dir: 'raw/财务部/monthly_reports',
    keyRegex: /^\d{4}-\d{2}$/,
    period: 'monthly',
    type: 'financial',
  },
  'financial-quarterly': {
    label: '财务季报',
    dir: 'raw/财务部/quarterly_reports',
    keyRegex: /^\d{4}-Q[1-4]$/,
    period: 'quarterly',
    type: 'financial',
  },
  'financial-annual': {
    label: '财务年报',
    dir: 'raw/财务部/annual_reports',
    keyRegex: /^\d{4}$/,
    period: 'annual',
    type: 'financial',
  },
  'ops-quarterly': {
    label: '运营季度分析',
    dir: 'raw/财务部/ops_quarterly',
    keyRegex: /^\d{4}-Q[1-4]$/,
    period: 'quarterly',
    type: 'ops',
  },
  'ops-annual': {
    label: '运营年度分析',
    dir: 'raw/财务部/ops_annual',
    keyRegex: /^\d{4}$/,
    period: 'annual',
    type: 'ops',
  },
};

export function isReportCategory(s: string): s is ReportCategory {
  return s in REPORT_CATEGORY_META;
}

export interface ReportEntry {
  category: ReportCategory;
  key: string; // "2026-04" / "2026-Q2" / "2026"
  filename: string;
  path: string;
  htmlUrl?: string;
  size: number;
  sha: string;
}

export interface ReportContent {
  category: ReportCategory;
  key: string;
  markdown: string;
  htmlUrl?: string;
}

/** 列出某类报告，按 key 倒序（最近的在前） */
export async function listVaultReports(category: ReportCategory): Promise<ReportEntry[]> {
  const meta = REPORT_CATEGORY_META[category];
  const entries = await fetchVaultDir(meta.dir);
  if (!entries) return [];
  return entries
    .filter((e) => {
      if (e.type !== 'file' || !e.name.endsWith('.md')) return false;
      const key = e.name.replace(/\.md$/, '');
      return meta.keyRegex.test(key);
    })
    .map((e) => ({
      category,
      key: e.name.replace(/\.md$/, ''),
      filename: e.name,
      path: e.path,
      htmlUrl: e.html_url,
      size: e.size,
      sha: e.sha,
    }))
    .sort((a, b) => b.key.localeCompare(a.key));
}

/** 拉某份报告 markdown 内容 */
export async function getVaultReport(
  category: ReportCategory,
  key: string,
): Promise<ReportContent | null> {
  const meta = REPORT_CATEGORY_META[category];
  if (!meta.keyRegex.test(key)) return null;
  const path = `${meta.dir}/${key}.md`;
  const md = await fetchVaultText(path);
  if (md === null) return null;
  return {
    category,
    key,
    markdown: md,
    htmlUrl: `https://github.com/${OWNER}/${REPO}/blob/${BRANCH}/${encodeURI(path)}`,
  };
}

// ============ 兼容旧 API（财务月报）============

export interface MonthlyReportEntry {
  yearMonth: string;
  filename: string;
  path: string;
  htmlUrl?: string;
  size: number;
  sha: string;
}

export interface MonthlyReportContent {
  yearMonth: string;
  markdown: string;
  htmlUrl?: string;
}

/** @deprecated 用 listVaultReports('financial-monthly') —— 保留兼容 PR #44 调用方 */
export async function listMonthlyReports(): Promise<MonthlyReportEntry[]> {
  const entries = await listVaultReports('financial-monthly');
  return entries.map((e) => ({
    yearMonth: e.key,
    filename: e.filename,
    path: e.path,
    htmlUrl: e.htmlUrl,
    size: e.size,
    sha: e.sha,
  }));
}

/** @deprecated 用 getVaultReport('financial-monthly', yearMonth) */
export async function getMonthlyReport(yearMonth: string): Promise<MonthlyReportContent | null> {
  const content = await getVaultReport('financial-monthly', yearMonth);
  if (!content) return null;
  return { yearMonth: content.key, markdown: content.markdown, htmlUrl: content.htmlUrl };
}
