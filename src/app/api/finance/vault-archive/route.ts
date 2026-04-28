/**
 * Vault 归档 API（三向分发的第三步）
 *
 * POST /api/finance/vault-archive
 *
 * 让 5 个财务 AI 把工作产出归档到 GitHub `lty-vault` repo，
 * 路径形如 `raw/ai_reports/<role>/YYYY-MM-DDTHHmmss-<slug>.md`。
 *
 * 直接调 GitHub REST API（PUT /repos/{owner}/{repo}/contents/{path}），
 * 不引第三方 sdk。需要环境变量 `GITHUB_VAULT_TOKEN`（fine-grained PAT，
 * 范围只到 lungtszyiu-creator/lty-vault repo + Contents Read/Write）。
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthOrApiKey } from '@/lib/api-auth';
import { logAiActivity } from '@/lib/ai-log';

const VAULT_OWNER = 'lungtszyiu-creator';
const VAULT_REPO = 'lty-vault';

const createSchema = z.object({
  role: z.enum([
    'voucher_clerk',
    'chain_bookkeeper',
    'forex_lookout',
    'reconciler',
    'cfo',
  ]),
  category: z.string().min(1).max(40),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
  // 可选：调用方指定路径前缀，默认 raw/ai_reports
  pathPrefix: z.string().optional(),
});

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '') // 去掉 emoji / 中文 / 特殊符号
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'untitled';
}

function buildVaultPath(role: string, title: string, prefix: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mi = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  const ts = `${yyyy}-${mm}-${dd}T${hh}${mi}${ss}`;
  return `${prefix}/${role}/${ts}-${slugify(title)}.md`;
}

export async function POST(req: NextRequest) {
  // 任何 FINANCE_AI:* + FINANCE_ADMIN 都可写 vault
  const auth = await requireAuthOrApiKey(
    req,
    [
      'FINANCE_AI:voucher_clerk',
      'FINANCE_AI:chain_bookkeeper',
      'FINANCE_AI:forex_lookout',
      'FINANCE_AI:reconciler',
      'FINANCE_AI:cfo',
    ],
    'EDIT',
  );
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parseResult = createSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: 'VALIDATION_FAILED',
        issues: parseResult.error.issues.map((i) => ({ path: i.path, message: i.message })),
        received: body,
      },
      { status: 400 },
    );
  }
  const data = parseResult.data;

  const token = process.env.GITHUB_VAULT_TOKEN;
  if (!token) {
    return NextResponse.json(
      {
        error: 'VAULT_TOKEN_NOT_CONFIGURED',
        message:
          'Set GITHUB_VAULT_TOKEN env var (fine-grained PAT with Contents R/W on lty-vault repo).',
      },
      { status: 500 },
    );
  }

  const prefix = data.pathPrefix ?? 'raw/ai_reports';
  const path = buildVaultPath(data.role, data.title, prefix);

  // markdown 头加 frontmatter，便于维基管家 ingest 时识别来源
  const frontmatter = [
    '---',
    `role: ${data.role}`,
    `category: ${data.category}`,
    `title: ${data.title.replace(/"/g, '\\"')}`,
    `created_at: ${new Date().toISOString()}`,
    `created_by_ai: true`,
    '---',
    '',
  ].join('\n');
  const fullContent = frontmatter + data.content;
  const contentBase64 = Buffer.from(fullContent, 'utf8').toString('base64');

  const commitMessage = `[${data.role}] ${data.title}`;
  const apiUrl = `https://api.github.com/repos/${VAULT_OWNER}/${VAULT_REPO}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`;

  const ghResp = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: commitMessage,
      content: contentBase64,
    }),
  });

  if (!ghResp.ok) {
    const errBody = await ghResp.text();
    return NextResponse.json(
      {
        error: 'GITHUB_API_FAILED',
        status: ghResp.status,
        githubResponse: errBody.slice(0, 500),
      },
      { status: 502 },
    );
  }

  const ghJson = (await ghResp.json()) as {
    content?: { sha?: string; path?: string; html_url?: string };
    commit?: { sha?: string; html_url?: string };
  };

  if (auth.kind === 'apikey') {
    await logAiActivity({
      aiRole: auth.ctx.scope.split(':')[1] ?? data.role,
      action: 'archive_to_obsidian',
      apiKeyId: auth.ctx.apiKeyId,
      payload: {
        path,
        category: data.category,
        title: data.title,
        commitSha: ghJson.commit?.sha,
      },
      vaultWritten: true,
    });
  }

  return NextResponse.json(
    {
      ok: true,
      path,
      commitSha: ghJson.commit?.sha ?? null,
      contentSha: ghJson.content?.sha ?? null,
      htmlUrl: ghJson.content?.html_url ?? null,
    },
    { status: 201 },
  );
}
