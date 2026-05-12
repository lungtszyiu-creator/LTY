/**
 * 通用 vault 文件上传端点（AI 把工作产出真实落到 lty-vault）
 *
 * 老板 5/13：行政 AI 报 "我把执照年检文件写到 raw/行政部/..." 但 vaultPath 只是
 * 字符串自报，没有真实文件落地 → 同事点击 vaultPath 链接 404。这个 endpoint
 * 是 paradigm 的另一面：让 AI 把成果**真实**写进 vault，vaultPath 不再是空字符串。
 *
 * 与 /api/finance/vault-archive 的差异：那个是 finance 部专用 + path 自动生成；
 * 本端点通用所有部门 + path 由 AI 自定（但必须落在该 AI deptSlug 对应目录）。
 *
 * POST /api/v1/vault/commit
 *   X-Api-Key: lty_xxxx       （任何 active AI 员工的 key，与 activity-log 同款鉴权）
 *   Body:
 *     {
 *       "path": "raw/行政部/2026/执照年检/审计报告.md",   // 必填，必须前缀匹配 deptSlug
 *       "content": "# 审计报告\n...",                     // 文本内容（UTF-8）
 *       // OR
 *       "contentBase64": "JVBERi0xLjQK...",              // 二进制（PDF/图片）— 二选一
 *       "summary": "完成执照年检审计报告",                  // 选填 → 同步写一条 activity-log
 *       "action": "audit_license_renewal",                // 选填，配 summary 用
 *       "commitMessage": "..."                            // 选填，默认 "[<role>] <path>"
 *     }
 *
 * 路径权限映射（跟 /api/dept/vault-tree 反向对齐）：
 *   admin       → raw/行政部/
 *   hr          → raw/人事部/
 *   finance     → raw/财务部/
 *   cashier     → raw/财务部/
 *   lty-legal   → raw/法务部/
 *   ai          → raw/AI部/
 *
 * AI 员工 deptSlug=null（跨部门）一律拒——逼先去 /employees 设部门，
 * 防 sloppy AI 越界写其他部门文件。MC 法务（mc-legal）不在此端点处理，
 * 走独立 mc-legal-vault repo（数据红线物理隔离）。
 *
 * 返回：
 *   201 { ok, path, commitSha, contentSha, htmlUrl, aiActivityLogId }
 *   403 PATH_NOT_ALLOWED / DEPT_NOT_SET
 *   409 FILE_ALREADY_EXISTS（GitHub Contents API 不带 SHA 不能覆盖）
 *   413 PAYLOAD_TOO_LARGE（GitHub Contents API 1MB 限制）
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { hashApiKey } from '@/lib/api-auth';
import { logAiActivity } from '@/lib/ai-log';

export const dynamic = 'force-dynamic';

const VAULT_OWNER = 'lungtszyiu-creator';
const VAULT_REPO = 'lty-vault';

/** deptSlug → 该 AI 允许的 vault path 前缀白名单（多个等价路径都允许） */
const DEPT_PATH_PREFIXES: Record<string, string[]> = {
  admin: ['raw/行政部/'],
  hr: ['raw/人事部/'],
  finance: ['raw/财务部/'],
  cashier: ['raw/财务部/'],
  'lty-legal': ['raw/法务部/'],
  ai: ['raw/AI部/'],
};

const writeSchema = z
  .object({
    path: z.string().min(3).max(500),
    content: z.string().max(900_000).optional(), // 文本上限 ~900KB（留 base64 膨胀余量）
    contentBase64: z.string().max(1_200_000).optional(), // 1MB 文件 → ~1.33MB base64
    summary: z.string().max(500).optional(),
    action: z.string().min(1).max(80).optional(),
    commitMessage: z.string().max(200).optional(),
  })
  .refine((d) => !!d.content || !!d.contentBase64, {
    message: 'content 或 contentBase64 至少要传一个',
    path: ['content'],
  })
  .refine((d) => !(d.content && d.contentBase64), {
    message: 'content 和 contentBase64 只能传一个',
    path: ['content'],
  });

function validatePath(rawPath: string): string | null {
  if (rawPath.includes('..')) return '路径不能含 ..';
  if (rawPath.startsWith('/')) return '路径不能以 / 开头';
  if (rawPath.endsWith('/')) return '路径必须指向文件，不是目录';
  return null;
}

export async function POST(req: NextRequest) {
  // 1. X-Api-Key 鉴权（跟 activity-log 同款：不强 scope，仅校验 AI 员工 active）
  const headerKey = req.headers.get('x-api-key');
  if (!headerKey) {
    return NextResponse.json({ error: 'API_KEY_MISSING' }, { status: 401 });
  }
  const apiKey = await prisma.apiKey.findUnique({
    where: { hashedKey: hashApiKey(headerKey) },
    select: {
      id: true,
      active: true,
      revokedAt: true,
      expiresAt: true,
      scope: true,
      aiEmployee: {
        select: { id: true, name: true, role: true, deptSlug: true, active: true, paused: true },
      },
    },
  });
  if (!apiKey || !apiKey.active || apiKey.revokedAt) {
    return NextResponse.json({ error: 'API_KEY_INVALID_OR_REVOKED' }, { status: 401 });
  }
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return NextResponse.json({ error: 'API_KEY_EXPIRED' }, { status: 401 });
  }
  if (!apiKey.aiEmployee) {
    return NextResponse.json(
      {
        error: 'API_KEY_NOT_LINKED_TO_EMPLOYEE',
        hint: '本 ApiKey 没挂在任何 AI 员工档案上。先去 /employees 创建员工并绑定 key。',
      },
      { status: 403 },
    );
  }
  if (!apiKey.aiEmployee.active) {
    return NextResponse.json(
      { error: 'EMPLOYEE_INACTIVE', hint: '员工已停用，不能写 vault' },
      { status: 403 },
    );
  }
  if (apiKey.aiEmployee.paused) {
    return NextResponse.json(
      { error: 'EMPLOYEE_PAUSED', hint: 'AI 员工撞顶暂停中，等老板解锁后再写 vault' },
      { status: 403 },
    );
  }

  const deptSlug = apiKey.aiEmployee.deptSlug;
  if (!deptSlug) {
    return NextResponse.json(
      {
        error: 'DEPT_NOT_SET',
        hint: 'AI 员工档案没设部门（deptSlug=null）。让老板去 /employees 编辑该 AI 选「归属部门」后再调本接口。',
      },
      { status: 403 },
    );
  }

  const allowedPrefixes = DEPT_PATH_PREFIXES[deptSlug];
  if (!allowedPrefixes) {
    return NextResponse.json(
      {
        error: 'DEPT_NOT_SUPPORTED',
        hint: `部门 slug=${deptSlug} 暂无 vault 写入权限映射；MC 法务请走独立 mc-legal-vault repo`,
      },
      { status: 403 },
    );
  }

  // 2. body 校验
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'INVALID_JSON', hint: '请求 body 不是合法 JSON' },
      { status: 400 },
    );
  }
  const parsed = writeSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: 'VALIDATION_FAILED',
        hint: `字段 ${first?.path.join('.') ?? '?'} 不合法：${first?.message ?? '?'}`,
        issues: parsed.error.issues,
      },
      { status: 422 },
    );
  }
  const data = parsed.data;

  // 3. path 校验：格式 + 必须落在该 AI deptSlug 对应目录
  const pathErr = validatePath(data.path);
  if (pathErr) {
    return NextResponse.json(
      { error: 'INVALID_PATH', hint: pathErr },
      { status: 400 },
    );
  }
  const prefixMatched = allowedPrefixes.some((p) => data.path.startsWith(p));
  if (!prefixMatched) {
    return NextResponse.json(
      {
        error: 'PATH_NOT_ALLOWED',
        hint: `本 AI（${apiKey.aiEmployee.name}，deptSlug=${deptSlug}）只能写：${allowedPrefixes.join(' / ')}；实际 path=${data.path}`,
      },
      { status: 403 },
    );
  }

  // 4. GitHub token
  const token = process.env.VAULT_GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'VAULT_TOKEN_NOT_CONFIGURED' },
      { status: 500 },
    );
  }

  // 5. 拼 content base64（文本走 markdown frontmatter，二进制原样）
  let contentBase64: string;
  let sizeBytes: number;
  if (data.contentBase64) {
    contentBase64 = data.contentBase64.replace(/\s/g, '');
    sizeBytes = Math.floor((contentBase64.length * 3) / 4); // 估算
  } else {
    const frontmatter = [
      '---',
      `ai_employee: ${apiKey.aiEmployee.name}`,
      `ai_role: ${apiKey.aiEmployee.role}`,
      `dept_slug: ${deptSlug}`,
      `created_at: ${new Date().toISOString()}`,
      `created_by_ai: true`,
      '---',
      '',
    ].join('\n');
    const fullText = frontmatter + data.content!;
    contentBase64 = Buffer.from(fullText, 'utf8').toString('base64');
    sizeBytes = Buffer.byteLength(fullText, 'utf8');
  }

  if (sizeBytes > 1_000_000) {
    return NextResponse.json(
      {
        error: 'PAYLOAD_TOO_LARGE',
        hint: `GitHub Contents API 限制 1MB，实际 ${(sizeBytes / 1024).toFixed(0)}KB。改用 git LFS 或拆文件。`,
      },
      { status: 413 },
    );
  }

  const commitMessage =
    data.commitMessage ?? `[${apiKey.aiEmployee.role}] ${data.path}`;
  const encodedPath = data.path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const ghUrl = `https://api.github.com/repos/${VAULT_OWNER}/${VAULT_REPO}/contents/${encodedPath}`;

  let ghResp: Response;
  try {
    ghResp = await fetch(ghUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: commitMessage, content: contentBase64 }),
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: 'GITHUB_FETCH_FAILED',
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    );
  }

  if (!ghResp.ok) {
    const errText = await ghResp.text();
    if (ghResp.status === 422 && errText.includes('already exists')) {
      return NextResponse.json(
        {
          error: 'FILE_ALREADY_EXISTS',
          hint: '同 path 文件已存在；GitHub Contents API 不带 SHA 不能覆盖。换 filename 或加时间戳后缀。',
          path: data.path,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        error: 'GITHUB_API_FAILED',
        status: ghResp.status,
        githubResponse: errText.slice(0, 500),
      },
      { status: 502 },
    );
  }

  const ghJson = (await ghResp.json()) as {
    content?: { sha?: string; path?: string; html_url?: string };
    commit?: { sha?: string; html_url?: string };
  };

  // 6. 看板透明文化：写一条 activity-log → 自动出现在 /dept/ai 工作日记
  // 注意 ai_role 字段填档案中的 role；summary/action 用 AI 传的（如有）
  const aiActivityLogId = await logAiActivity({
    aiRole: apiKey.aiEmployee.role || 'vault_committer',
    action: data.action || 'vault_commit',
    apiKeyId: apiKey.id,
    payload: {
      summary: data.summary || `落 vault：${data.path.split('/').pop()}`,
      vaultPath: data.path,
      commitSha: ghJson.commit?.sha,
      sizeBytes,
    },
    vaultWritten: true,
  }).catch(() => null);

  return NextResponse.json(
    {
      ok: true,
      path: data.path,
      commitSha: ghJson.commit?.sha ?? null,
      contentSha: ghJson.content?.sha ?? null,
      htmlUrl: ghJson.content?.html_url ?? null,
      aiActivityLogId,
      hint: `文件已落到 lty-vault。同事在 /dept/${deptSlug} 「vault 文档」tab 直接看得到；点 activity log 的 vaultPath 也能跳 GitHub 真实文件。`,
    },
    { status: 201 },
  );
}
