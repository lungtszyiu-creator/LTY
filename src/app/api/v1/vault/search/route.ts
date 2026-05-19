/**
 * Vault 只读检索端点（防 vault 污染 paradigm · 5/19 V5.2 增量）
 *
 * Maggie 5/19 反馈：LTY 法务部"证照管家" / MC 法务部"牌照管家"数字员工
 * 需要查 vault 已有档案做答疑。之前 vault 只能 list 目录（vault-tree），
 * 没关键词搜索 + 内容摘要，AI 决策不动。
 *
 * 本 endpoint 纯 GET 零写入，与 POST /api/v1/ai-outputs 职责对称：
 *   - ai-outputs = AI 写入 inbox（需审核才入 vault）
 *   - vault/search = AI 只读检索现有 vault 档案
 *
 * Key 独立：Maggie 偏好用 `LTY_LEGAL_VAULT_READ` / `MC_LEGAL_VAULT_READ`
 * 窄 scope（与 ADMIN Key 物理分离，泄漏只影响"读"）。本 endpoint 同时
 * 接受更宽 scope（*_READONLY / *_AI:* / *_ADMIN）做向后兼容。
 *
 * GET /api/v1/vault/search?dept=lty-legal&category=证照&q=登记证&limit=5
 *   Header（二选一）：
 *     X-Api-Key: lty_xxx     (LTY 看板统一 paradigm，推荐)
 *     X-Read-Key: lty_xxx    (Maggie V5.2 spec 命名 alias，等价)
 *
 *   Query：
 *     dept (必填) — lty-legal | mc-legal | 法务部 | MC法务 | LTY_LEGAL | MC_LEGAL
 *                  必须跟 scope 部门匹配，否则 403
 *     category (选填) — 子目录名（lty: 证照/合同/票据/声明/争议诉讼；mc: 自由）
 *     q (选填) — 关键词，模糊匹配文件名 + markdown 正文
 *     limit (选填) — 默认 5，最大 20
 *
 * Response 200：
 *   { results: [{ doc_id, title, category, file_url, content_snippet, updated_at }], total }
 *
 * 实现：单次 GitHub Trees API (recursive=1) 拿整 repo 树 → 服务端过滤
 *   - vault 通常 < 1000 文件，单次 fetch + 内存过滤 < 200ms
 *   - 文件多再切 Postgres FTS（vault-etl 已 ready）
 *
 * 物理隔离：
 *   - lty-legal → lty-vault repo (VAULT_GITHUB_TOKEN) / 路径前缀 raw/法务部/
 *   - mc-legal → mc-legal-vault repo (MC_VAULT_GITHUB_TOKEN) / 整 repo
 *   两套 token 独立，MC 红线物理隔离不变
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashApiKey } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const OWNER = 'lungtszyiu-creator';

/** dept 入参 → 内部 slug 归一（接受 Maggie V5.2 多种写法） */
const DEPT_TO_SLUG: Record<string, string> = {
  'lty-legal': 'lty-legal',
  法务部: 'lty-legal',
  LTY_LEGAL: 'lty-legal',
  lty_legal: 'lty-legal',
  'mc-legal': 'mc-legal',
  MC法务: 'mc-legal',
  MC法务部: 'mc-legal',
  MC_LEGAL: 'mc-legal',
  mc_legal: 'mc-legal',
};

/** 各 dept scope 的允许列表（VAULT_READ 是 Maggie 推荐的窄 scope；其他都向后兼容） */
const ALLOWED_SCOPES_BY_DEPT: Record<string, string[]> = {
  'lty-legal': [
    'LTY_LEGAL_VAULT_READ',
    'LTY_LEGAL_READONLY',
    'LTY_LEGAL_AI:legal_clerk',
    'LTY_LEGAL_AI:assistant',
    'LTY_LEGAL_ADMIN',
  ],
  'mc-legal': [
    'MC_LEGAL_VAULT_READ',
    'MC_LEGAL_READONLY',
    'MC_LEGAL_AI:legal_clerk',
    'MC_LEGAL_AI:assistant',
    'MC_LEGAL_ADMIN',
  ],
};

/** dept → 仓库配置 */
function deptVaultConfig(slug: string): {
  repo: string;
  pathPrefix: string;
  token: string | undefined;
  tokenEnv: string;
} | null {
  if (slug === 'lty-legal') {
    return {
      repo: 'lty-vault',
      pathPrefix: 'raw/法务部/',
      token: process.env.VAULT_GITHUB_TOKEN,
      tokenEnv: 'VAULT_GITHUB_TOKEN',
    };
  }
  if (slug === 'mc-legal') {
    return {
      repo: 'mc-legal-vault',
      pathPrefix: '', // 整 repo（mc-legal-vault 自身就是 MC 法务空间）
      token: process.env.MC_VAULT_GITHUB_TOKEN,
      tokenEnv: 'MC_VAULT_GITHUB_TOKEN',
    };
  }
  return null;
}

/** GitHub Trees API 返回的 blob 项 */
interface GhTreeBlob {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

/** 拉整树（recursive=1）— 单次调用拿全部 blob */
async function fetchRepoTree(
  repo: string,
  token: string,
): Promise<GhTreeBlob[] | { error: string; status: number }> {
  const url = `https://api.github.com/repos/${OWNER}/${repo}/git/trees/main?recursive=1`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), status: 502 };
  }
  if (!resp.ok) {
    const text = await resp.text();
    return { error: `GitHub Trees ${resp.status}: ${text.slice(0, 200)}`, status: 502 };
  }
  const data = (await resp.json()) as { tree?: GhTreeBlob[]; truncated?: boolean };
  if (data.truncated) {
    console.warn(`[vault/search] tree truncated for ${repo} (>100k entries / 7MB)`);
  }
  return data.tree ?? [];
}

/** 拉单文件 raw 内容（markdown 摘要用） */
async function fetchBlobText(
  repo: string,
  path: string,
  token: string,
  maxBytes = 4096,
): Promise<string | null> {
  const encodedPath = path
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  const url = `https://api.github.com/repos/${OWNER}/${repo}/contents/${encodedPath}?ref=main`;
  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.raw',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    });
    if (!resp.ok) return null;
    const text = await resp.text();
    return text.slice(0, maxBytes);
  } catch {
    return null;
  }
}

/**
 * 拉单文件最后一次 commit 的 author date（用于 updated_at）
 * v1.1 with_mtime=true 时按 result 数量调用（N+1，注意 rate limit）。
 */
async function fetchLastCommitDate(
  repo: string,
  path: string,
  token: string,
): Promise<string | null> {
  const encodedPath = encodeURIComponent(path);
  const url = `https://api.github.com/repos/${OWNER}/${repo}/commits?path=${encodedPath}&per_page=1`;
  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as Array<{ commit?: { author?: { date?: string } } }>;
    return data?.[0]?.commit?.author?.date ?? null;
  } catch {
    return null;
  }
}

/** 从 path 推导 category（pathPrefix 之后的第一段） */
function deriveCategory(path: string, pathPrefix: string): string {
  const rel = pathPrefix && path.startsWith(pathPrefix) ? path.slice(pathPrefix.length) : path;
  const firstSeg = rel.split('/')[0];
  return firstSeg || '';
}

/** 从 path 推导 title（去掉扩展名的文件名） */
function deriveTitle(path: string): string {
  const basename = path.split('/').pop() ?? path;
  return basename.replace(/\.(md|pdf|docx?|xlsx?|pptx?|png|jpe?g|gif)$/i, '');
}

const TEXT_EXTENSIONS = new Set(['md', 'markdown', 'txt']);
function isTextFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return TEXT_EXTENSIONS.has(ext);
}

export async function GET(req: NextRequest) {
  // 1. 鉴权：X-Api-Key 或 X-Read-Key（Maggie V5.2 alias）
  const headerKey =
    req.headers.get('x-api-key') ?? req.headers.get('x-read-key');
  if (!headerKey) {
    return NextResponse.json(
      {
        error: 'API_KEY_MISSING',
        hint: '请在 Header 传 X-Api-Key 或 X-Read-Key（二选一，等价）',
      },
      { status: 401 },
    );
  }
  const apiKey = await prisma.apiKey.findUnique({
    where: { hashedKey: hashApiKey(headerKey) },
    select: {
      id: true,
      active: true,
      revokedAt: true,
      expiresAt: true,
      scope: true,
    },
  });
  if (!apiKey || !apiKey.active || apiKey.revokedAt) {
    return NextResponse.json({ error: 'API_KEY_INVALID_OR_REVOKED' }, { status: 401 });
  }
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return NextResponse.json({ error: 'API_KEY_EXPIRED' }, { status: 401 });
  }

  // 2. 解析 dept query + 校验 scope 跟 dept 匹配
  const rawDept = req.nextUrl.searchParams.get('dept');
  if (!rawDept) {
    return NextResponse.json(
      {
        error: 'DEPT_MISSING',
        hint: 'query 必须传 dept，例如 dept=lty-legal 或 dept=法务部',
      },
      { status: 400 },
    );
  }
  const deptSlug = DEPT_TO_SLUG[rawDept];
  if (!deptSlug) {
    return NextResponse.json(
      {
        error: 'DEPT_UNKNOWN',
        hint: `dept=${rawDept} 未识别。接受 lty-legal / mc-legal / 法务部 / MC法务 等`,
      },
      { status: 400 },
    );
  }
  const allowedScopes = ALLOWED_SCOPES_BY_DEPT[deptSlug] ?? [];
  if (!allowedScopes.includes(apiKey.scope)) {
    return NextResponse.json(
      {
        error: 'SCOPE_DEPT_MISMATCH',
        hint: `本 key scope=${apiKey.scope} 不允许检索 dept=${deptSlug}。需要 ${allowedScopes.join(' / ')} 之一`,
      },
      { status: 403 },
    );
  }

  // 3. dept 仓库配置 + token 校验
  const cfg = deptVaultConfig(deptSlug);
  if (!cfg) {
    return NextResponse.json(
      { error: 'DEPT_NOT_SUPPORTED', hint: `dept=${deptSlug} 暂无 vault 配置` },
      { status: 500 },
    );
  }
  if (!cfg.token) {
    return NextResponse.json(
      {
        error: 'VAULT_TOKEN_NOT_CONFIGURED',
        hint: `Vercel env 缺 ${cfg.tokenEnv}（需对 ${OWNER}/${cfg.repo} Contents Read）`,
      },
      { status: 500 },
    );
  }

  // 4. 其他 query 参数
  const category = req.nextUrl.searchParams.get('category')?.trim() || null;
  const q = req.nextUrl.searchParams.get('q')?.trim() || null;
  const limitRaw = req.nextUrl.searchParams.get('limit');
  const limit = Math.min(Math.max(parseInt(limitRaw || '5', 10) || 5, 1), 20);
  // v1.1: with_mtime opt-in 返 updated_at（每 result 1 次 GitHub Commits API 调用，注意 rate limit）
  const withMtime = req.nextUrl.searchParams.get('with_mtime') === 'true';

  // 5. 拉树
  const treeOrErr = await fetchRepoTree(cfg.repo, cfg.token);
  if (!Array.isArray(treeOrErr)) {
    return NextResponse.json(
      {
        error: 'VAULT_FETCH_FAILED',
        hint: treeOrErr.error,
      },
      { status: treeOrErr.status },
    );
  }
  const tree = treeOrErr;

  // 6. 过滤 blobs：仅文件 + 落在 pathPrefix 内 + 不含 .git/.obsidian 等噪声
  let candidates = tree.filter((entry) => {
    if (entry.type !== 'blob') return false;
    if (cfg.pathPrefix && !entry.path.startsWith(cfg.pathPrefix)) return false;
    const segments = entry.path.split('/');
    if (segments.some((s) => s.startsWith('.git') || s === '.obsidian')) return false;
    return true;
  });

  // 7. category 过滤（pathPrefix 后第一段必须等于 category）
  if (category) {
    candidates = candidates.filter((entry) => deriveCategory(entry.path, cfg.pathPrefix) === category);
  }

  // 8. q 关键词过滤
  //    - 文件名匹配（含路径）→ 全部命中
  //    - 文本文件（.md/.markdown/.txt）→ 服务端额外取内容做 ILIKE 匹配
  //    内容匹配较贵（N+1 fetch），所以先按文件名筛掉一批，剩余的再 fetch
  const qLower = q?.toLowerCase() ?? '';
  let nameMatches = candidates;
  if (q) {
    nameMatches = candidates.filter((entry) => entry.path.toLowerCase().includes(qLower));
  }

  // 文件名命中已经够，content_snippet 仅对前 limit 个 markdown 文件 fetch（控成本）
  // 没传 q 时按 path 字母序倒序（近似最近优先 — 真正 mtime 后续 v1.1 加 commits API）
  if (!q) {
    nameMatches.sort((a, b) => b.path.localeCompare(a.path));
  }

  const topMatches = nameMatches.slice(0, limit);

  // 9. 取 content_snippet（仅 text 文件，前 500 字）
  //    v1.1: withMtime=true 时同时取 updated_at（每 result 多 1 次 GitHub Commits API 调用）
  const results = await Promise.all(
    topMatches.map(async (entry) => {
      let snippet = '';
      if (isTextFile(entry.path)) {
        const text = await fetchBlobText(cfg.repo, entry.path, cfg.token!, 2000);
        if (text) {
          // 简单清理 frontmatter
          const cleaned = text.replace(/^---[\s\S]*?---\s*/, '');
          snippet = cleaned.slice(0, 500).trim();
        }
      } else {
        // 非文本文件：用文件名做 snippet
        snippet = `[${entry.path.split('.').pop()?.toUpperCase()} 文件] ${deriveTitle(entry.path)}`;
      }
      const encodedPath = entry.path
        .split('/')
        .map((s) => encodeURIComponent(s))
        .join('/');
      // updated_at 仅在 with_mtime=true 时调；默认 null 省 N+1 GitHub Commits API 调用
      const updatedAt = withMtime
        ? await fetchLastCommitDate(cfg.repo, entry.path, cfg.token!)
        : null;
      return {
        doc_id: entry.sha,
        title: deriveTitle(entry.path),
        category: deriveCategory(entry.path, cfg.pathPrefix),
        file_url: `https://github.com/${OWNER}/${cfg.repo}/blob/main/${encodedPath}`,
        content_snippet: snippet,
        updated_at: updatedAt,
        path: entry.path,
        size_bytes: entry.size ?? 0,
      };
    }),
  );

  return NextResponse.json({
    results,
    total: nameMatches.length,
    dept: deptSlug,
    category,
    q,
    limit,
    with_mtime: withMtime,
    hint:
      'file_url 是 GitHub web 链接（私有 repo，需 Maggie 本地配 GitHub PAT 才能打开）。'
      + ' 若 AI 需要文件正文：（a）markdown 已在 content_snippet 前 500 字；'
      + '（b）PDF / docx 调 GET /api/v1/vault/file?dept=...&path=... 拿抽好的纯文本（v1.1 已上线）。'
      + ' 需要修改时间加 with_mtime=true（每 result 多 1 次 GitHub 调用，限频时建议关）。',
  });
}
