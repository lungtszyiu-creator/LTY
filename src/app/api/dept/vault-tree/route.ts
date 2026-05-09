/**
 * LTY vault 文件浏览 API（部门通用）
 *
 * GET /api/dept/vault-tree?path=<rel/path>
 *
 * 用 GitHub Contents API 读 lungtszyiu-creator/lty-vault repo 的目录列表。
 * 部门成员只能传自己部门的 path 前缀，其他路径 403。
 *
 * 鉴权：
 * - SUPER_ADMIN 任何路径
 * - 部门 LEAD/MEMBER 仅 raw/<部门>/ 子树（按 path 前缀映射 dept slug）
 *
 * 用 VAULT_GITHUB_TOKEN（与 vault-archive / vault-ingest 共用，已配 lty-vault repo）。
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const VAULT_OWNER = 'lungtszyiu-creator';
const VAULT_REPO = 'lty-vault';

type GhEntry = {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  size: number;
  download_url: string | null;
  html_url: string;
};

// path 前缀 → 允许该部门 slug 访问
const DEPT_PATH_MAP: Record<string, string[]> = {
  'raw/财务部': ['finance', 'cashier'],
  'raw/人事部': ['hr'],
  'raw/行政部': ['admin'],
  'raw/法务部': ['lty-legal'],
  // 跨部门兜底所有人能看
  'raw/跨部门兜底': ['finance', 'cashier', 'hr', 'admin', 'lty-legal'],
  // wiki 公开（read-only）所有部门能看
  'wiki': ['finance', 'cashier', 'hr', 'admin', 'lty-legal'],
};

async function userDeptSlugs(userId: string): Promise<string[]> {
  const memberships = await prisma.departmentMembership.findMany({
    where: { userId },
    include: { department: { select: { slug: true } } },
  });
  return memberships.map((m) => m.department.slug);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 });
  }

  const token = process.env.VAULT_GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'VAULT_TOKEN_NOT_CONFIGURED' },
      { status: 500 },
    );
  }

  const rawPath = req.nextUrl.searchParams.get('path') ?? '';
  if (rawPath.includes('..') || rawPath.startsWith('/')) {
    return NextResponse.json({ error: 'INVALID_PATH' }, { status: 400 });
  }

  // 鉴权：SUPER_ADMIN 任何路径，否则按部门 slug 检查 path 前缀
  const isSuperAdmin = session.user.role === 'SUPER_ADMIN';
  if (!isSuperAdmin) {
    const userDepts = await userDeptSlugs(session.user.id);
    const matchedPrefix = Object.keys(DEPT_PATH_MAP).find((prefix) =>
      rawPath === prefix || rawPath.startsWith(prefix + '/'),
    );
    if (!matchedPrefix) {
      return NextResponse.json(
        { error: 'PATH_NOT_ALLOWED', hint: '该路径不在你部门权限范围' },
        { status: 403 },
      );
    }
    const allowedDepts = DEPT_PATH_MAP[matchedPrefix];
    if (!userDepts.some((d) => allowedDepts.includes(d))) {
      return NextResponse.json(
        { error: 'DEPT_PERMISSION_DENIED', hint: '需要对应部门成员身份' },
        { status: 403 },
      );
    }
  }

  const encodedPath = rawPath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const apiUrl = `https://api.github.com/repos/${VAULT_OWNER}/${VAULT_REPO}/contents/${encodedPath}`;

  let resp: Response;
  try {
    resp = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'GITHUB_FETCH_FAILED', message: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  if (!resp.ok) {
    const errText = await resp.text();
    return NextResponse.json(
      {
        error: resp.status === 404 ? 'NOT_FOUND' : 'GITHUB_API_FAILED',
        status: resp.status,
        message: errText.slice(0, 300),
      },
      { status: resp.status === 404 ? 404 : 502 },
    );
  }

  const data = (await resp.json()) as GhEntry | GhEntry[];
  const entries = Array.isArray(data) ? data : [data];

  const filtered = entries
    .filter((e) => !e.name.startsWith('.git'))
    .map((e) => ({
      name: e.name,
      path: e.path,
      type: e.type,
      size: e.size,
      htmlUrl: e.html_url,
      downloadUrl: e.download_url,
    }));

  filtered.sort((a, b) => {
    if (a.type === 'dir' && b.type !== 'dir') return -1;
    if (a.type !== 'dir' && b.type === 'dir') return 1;
    return a.name.localeCompare(b.name, 'zh-Hans');
  });

  return NextResponse.json({ path: rawPath, entries: filtered });
}
