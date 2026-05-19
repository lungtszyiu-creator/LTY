/**
 * Vault 单文件正文 proxy 端点（v1.1 · 兑现 PR #92 留白）
 *
 * Maggie 5/19 反馈：vault/search 给的 content_snippet 对 PDF 只返
 * `[PDF 文件] 文件名`，AI 答不了 "营业执照号是多少 / 注册资本多少 / 到期日"
 * 这类需要正文内容的问题。
 *
 * 本 endpoint 跟 vault/search 同 paradigm（鉴权 / 物理隔离 / dept 校验），
 * 但职责是**单文件深读**：给 path 返完整文本（PDF 抽文字 / docx 抽文字 /
 * 原始 markdown），AI 拿到正文做精准答疑。
 *
 * GET /api/v1/vault/file?dept=lty-legal&path=raw/法务部/证照/xxx.pdf
 *   Header（二选一）：X-Api-Key / X-Read-Key
 *   Query：
 *     dept (必填) — lty-legal | mc-legal | 法务部 | MC法务 | LTY_LEGAL | MC_LEGAL
 *     path (必填) — vault 内相对路径，必须落在 dept pathPrefix 下
 *
 * Response 200：
 *   {
 *     path,
 *     mime_type,         // pdf | docx | markdown | text | other
 *     content_text,      // 抽到的纯文本（cap 500k 字符）
 *     size_bytes,        // 原文件字节数
 *     sha,               // GitHub blob sha
 *     updated_at,        // GitHub 最后 commit 的 author date (ISO)
 *     truncated,         // content_text 是否被 500k 截断
 *     extracted_via,     // pdf-parse | mammoth | raw | placeholder
 *   }
 *
 * 错误码：
 *   401 API_KEY_*           Header / Key 无效
 *   400 DEPT_MISSING/UNKNOWN / PATH_MISSING / PATH_TRAVERSAL
 *   403 SCOPE_DEPT_MISMATCH / PATH_OUT_OF_DEPT（LTY key 想读 mc-legal-vault → 403）
 *   404 FILE_NOT_FOUND
 *   500 VAULT_TOKEN_NOT_CONFIGURED / EXTRACT_FAILED
 *   502 GITHUB_FETCH_FAILED
 *
 * 物理隔离：与 vault/search 一致（lty-vault / mc-legal-vault 两 repo 两 token）。
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashApiKey } from '@/lib/api-auth';

// pdf-parse / mammoth 必须 Node runtime（不能 edge）
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OWNER = 'lungtszyiu-creator';

/** 单文件文本上限：500k 字符（≈ 1.5MB UTF-8），防 OOM / 防超大响应 */
const CONTENT_TEXT_CAP = 500_000;

/** GitHub raw 文件大小上限：20MB（GitHub Contents API raw 默认上限 100MB，但 PDF 解析超 20MB 容易 OOM） */
const RAW_FETCH_BYTES_CAP = 20 * 1024 * 1024;

/** dept 入参 → 内部 slug 归一（与 vault/search 一致） */
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

/** scope 白名单与 vault/search 完全一致 */
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
      pathPrefix: '',
      token: process.env.MC_VAULT_GITHUB_TOKEN,
      tokenEnv: 'MC_VAULT_GITHUB_TOKEN',
    };
  }
  return null;
}

/** 按扩展名分流处理策略 */
type FileKind = 'pdf' | 'docx' | 'markdown' | 'text' | 'json' | 'binary' | 'other';
function classify(path: string): { kind: FileKind; mime: string } {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return { kind: 'pdf', mime: 'application/pdf' };
  if (ext === 'docx') return { kind: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  if (ext === 'md' || ext === 'markdown') return { kind: 'markdown', mime: 'text/markdown' };
  if (ext === 'txt') return { kind: 'text', mime: 'text/plain' };
  if (ext === 'json' || ext === 'yaml' || ext === 'yml') return { kind: 'json', mime: 'application/json' };
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'xlsx', 'xls', 'pptx', 'ppt', 'doc'].includes(ext)) {
    return { kind: 'binary', mime: 'application/octet-stream' };
  }
  return { kind: 'other', mime: 'application/octet-stream' };
}

/** path 合法性校验：防穿越 + 防越权读对方 vault */
function validatePath(path: string, cfg: { pathPrefix: string }): { ok: true } | { ok: false; code: string; hint: string; status: number } {
  if (!path) {
    return { ok: false, code: 'PATH_MISSING', hint: 'query 必须传 path', status: 400 };
  }
  if (path.includes('..') || path.startsWith('/')) {
    return {
      ok: false,
      code: 'PATH_TRAVERSAL',
      hint: 'path 不允许 .. 或绝对路径',
      status: 400,
    };
  }
  const segments = path.split('/');
  if (segments.some((s) => s.startsWith('.git') || s === '.obsidian' || s === 'node_modules')) {
    return {
      ok: false,
      code: 'PATH_BLOCKED_SEGMENT',
      hint: '.git / .obsidian / node_modules 不允许访问',
      status: 400,
    };
  }
  if (cfg.pathPrefix && !path.startsWith(cfg.pathPrefix)) {
    return {
      ok: false,
      code: 'PATH_OUT_OF_DEPT',
      hint: `path 必须落在 ${cfg.pathPrefix} 下（防 LTY key 读 MC vault 反之亦然）`,
      status: 403,
    };
  }
  return { ok: true };
}

/** 拉 GitHub 文件 metadata（含 size / sha），同时确认存在 */
async function fetchFileMeta(
  repo: string,
  path: string,
  token: string,
): Promise<
  | { ok: true; sha: string; size: number; download_url: string | null }
  | { ok: false; status: number; error: string }
> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.github.com/repos/${OWNER}/${repo}/contents/${encodedPath}?ref=main`;
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
    return { ok: false, status: 502, error: e instanceof Error ? e.message : String(e) };
  }
  if (resp.status === 404) {
    return { ok: false, status: 404, error: 'FILE_NOT_FOUND' };
  }
  if (!resp.ok) {
    const text = await resp.text();
    return { ok: false, status: 502, error: `GitHub Contents ${resp.status}: ${text.slice(0, 200)}` };
  }
  const data = (await resp.json()) as {
    sha?: string;
    size?: number;
    type?: string;
    download_url?: string | null;
  };
  if (data.type !== 'file') {
    return { ok: false, status: 400, error: 'NOT_A_FILE' };
  }
  return {
    ok: true,
    sha: data.sha ?? '',
    size: data.size ?? 0,
    download_url: data.download_url ?? null,
  };
}

/** 拉 GitHub raw 字节流（PDF / docx 必须走二进制） */
async function fetchRawBytes(
  repo: string,
  path: string,
  token: string,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; status: number; error: string }> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.github.com/repos/${OWNER}/${repo}/contents/${encodedPath}?ref=main`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.raw',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    });
  } catch (e) {
    return { ok: false, status: 502, error: e instanceof Error ? e.message : String(e) };
  }
  if (resp.status === 404) {
    return { ok: false, status: 404, error: 'FILE_NOT_FOUND' };
  }
  if (!resp.ok) {
    const text = await resp.text();
    return { ok: false, status: 502, error: `GitHub raw ${resp.status}: ${text.slice(0, 200)}` };
  }
  const ab = await resp.arrayBuffer();
  if (ab.byteLength > RAW_FETCH_BYTES_CAP) {
    return {
      ok: false,
      status: 413,
      error: `文件 ${(ab.byteLength / 1024 / 1024).toFixed(1)}MB 超过 20MB 解析上限`,
    };
  }
  return { ok: true, buffer: Buffer.from(ab) };
}

/** 拉文件最后一次 commit 时间（用于 updated_at） */
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

/** 截断 content_text 到 cap，返截断标记 */
function truncate(text: string): { content: string; truncated: boolean } {
  if (text.length <= CONTENT_TEXT_CAP) return { content: text, truncated: false };
  return { content: text.slice(0, CONTENT_TEXT_CAP), truncated: true };
}

export async function GET(req: NextRequest) {
  // 1. 鉴权
  const headerKey = req.headers.get('x-api-key') ?? req.headers.get('x-read-key');
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
    select: { id: true, active: true, revokedAt: true, expiresAt: true, scope: true },
  });
  if (!apiKey || !apiKey.active || apiKey.revokedAt) {
    return NextResponse.json({ error: 'API_KEY_INVALID_OR_REVOKED' }, { status: 401 });
  }
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return NextResponse.json({ error: 'API_KEY_EXPIRED' }, { status: 401 });
  }

  // 2. dept 解析 + scope 匹配
  const rawDept = req.nextUrl.searchParams.get('dept');
  if (!rawDept) {
    return NextResponse.json(
      { error: 'DEPT_MISSING', hint: 'query 必须传 dept' },
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
        hint: `本 key scope=${apiKey.scope} 不允许读 dept=${deptSlug}。需要 ${allowedScopes.join(' / ')} 之一`,
      },
      { status: 403 },
    );
  }

  // 3. dept 仓库配置
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
        hint: `Vercel env 缺 ${cfg.tokenEnv}`,
      },
      { status: 500 },
    );
  }

  // 4. path 校验
  const path = req.nextUrl.searchParams.get('path')?.trim() ?? '';
  const pathCheck = validatePath(path, cfg);
  if (!pathCheck.ok) {
    return NextResponse.json(
      { error: pathCheck.code, hint: pathCheck.hint },
      { status: pathCheck.status },
    );
  }

  // 5. 拿 metadata（含 size / sha）+ 校验存在
  const meta = await fetchFileMeta(cfg.repo, path, cfg.token);
  if (!meta.ok) {
    if (meta.status === 404) {
      return NextResponse.json(
        { error: 'FILE_NOT_FOUND', hint: `${cfg.repo}/${path} 不存在` },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: 'VAULT_FETCH_FAILED', hint: meta.error },
      { status: meta.status },
    );
  }

  const { kind, mime } = classify(path);

  // 6. 按 kind 分流抽文本
  let contentText = '';
  let extractedVia: 'pdf-parse' | 'mammoth' | 'raw' | 'placeholder' = 'placeholder';
  let extractError: string | null = null;

  if (kind === 'pdf' || kind === 'docx') {
    // PDF / docx 走二进制流抽文本
    const raw = await fetchRawBytes(cfg.repo, path, cfg.token);
    if (!raw.ok) {
      return NextResponse.json(
        { error: 'VAULT_FETCH_FAILED', hint: raw.error },
        { status: raw.status },
      );
    }
    try {
      if (kind === 'pdf') {
        const { PDFParse } = await import('pdf-parse');
        const parser = new PDFParse({ data: new Uint8Array(raw.buffer) });
        const result = await parser.getText();
        contentText = result.text ?? '';
        extractedVia = 'pdf-parse';
        await parser.destroy();
      } else {
        const mammoth = (await import('mammoth')).default ?? (await import('mammoth'));
        const result = await mammoth.extractRawText({ buffer: raw.buffer });
        contentText = result.value ?? '';
        extractedVia = 'mammoth';
      }
    } catch (e) {
      extractError = e instanceof Error ? e.message : String(e);
      contentText = `[${kind.toUpperCase()} 解析失败] ${path.split('/').pop()}`;
      extractedVia = 'placeholder';
    }
  } else if (kind === 'markdown' || kind === 'text' || kind === 'json') {
    // 文本类直接拉 raw
    const raw = await fetchRawBytes(cfg.repo, path, cfg.token);
    if (!raw.ok) {
      return NextResponse.json(
        { error: 'VAULT_FETCH_FAILED', hint: raw.error },
        { status: raw.status },
      );
    }
    contentText = raw.buffer.toString('utf-8');
    extractedVia = 'raw';
  } else {
    // binary / other：不解析，返占位（图片、xlsx、pptx 等）
    contentText = `[${kind === 'binary' ? '二进制' : '未知类型'} 文件] ${path.split('/').pop()}（暂不支持抽文本，请下载原文件查看）`;
    extractedVia = 'placeholder';
  }

  const { content: capped, truncated } = truncate(contentText);

  // 7. updated_at（最后 commit 时间）
  const updatedAt = await fetchLastCommitDate(cfg.repo, path, cfg.token);

  return NextResponse.json({
    path,
    mime_type: mime,
    content_text: capped,
    size_bytes: meta.size,
    sha: meta.sha,
    updated_at: updatedAt,
    truncated,
    extracted_via: extractedVia,
    ...(extractError ? { extract_error: extractError } : {}),
  });
}
