/**
 * MC 法务 vault 文件浏览 API
 *
 * GET /api/dept/mc-legal/vault-tree?path=<rel/path>
 *
 * 用 GitHub Contents API 读 lungtszyiu-creator/mc-legal-vault repo 的目录列表。
 * 2026-05-12 放宽：SUPER_ADMIN + MC 法务部成员（mc-legal）可调。
 *   宪法红线 MC 数据物理隔离的防护对象 = 营销/技术/财务等"非法务"部门，
 *   MC 法务部成员自己当然能看 MC vault。
 *
 * 环境变量：MC_VAULT_GITHUB_TOKEN（fine-grained PAT，对 mc-legal-vault repo Contents Read）
 *
 * 不缓存（私有数据 + 每次都查 GitHub），用 force-dynamic。
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const VAULT_OWNER = 'lungtszyiu-creator';
const VAULT_REPO = 'mc-legal-vault';

type GhEntry = {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  size: number;
  download_url: string | null;
  html_url: string;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  // 鉴权：SUPER_ADMIN 或 MC 法务部（mc-legal）成员
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 });
  }
  if (session.user.role !== 'SUPER_ADMIN') {
    const isMcMember = await prisma.departmentMembership.findFirst({
      where: {
        userId: session.user.id,
        department: { slug: 'mc-legal' },
      },
      select: { id: true },
    });
    if (!isMcMember) {
      return NextResponse.json(
        { error: 'FORBIDDEN', hint: 'MC 法务 vault 仅老板 + MC 法务部成员可见' },
        { status: 403 },
      );
    }
  }

  const token = process.env.MC_VAULT_GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json(
      {
        error: 'MC_VAULT_TOKEN_NOT_CONFIGURED',
        message:
          'Vercel env 缺 MC_VAULT_GITHUB_TOKEN（需对 lungtszyiu-creator/mc-legal-vault Contents Read）',
      },
      { status: 500 },
    );
  }

  // path 参数：相对 repo 根目录的子路径，默认空 = 根目录
  const rawPath = req.nextUrl.searchParams.get('path') ?? '';
  // 防 path traversal：禁 ".." / 绝对路径
  if (rawPath.includes('..') || rawPath.startsWith('/')) {
    return NextResponse.json({ error: 'INVALID_PATH' }, { status: 400 });
  }
  // URL encode 但保留 /
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
  // GitHub API 返回单个文件 → 对象，目录 → 数组。统一成数组。
  const entries = Array.isArray(data) ? data : [data];

  // 过滤 .git / .obsidian/workspace 之类隐私 / 噪声
  const filtered = entries
    .filter((e) => !e.name.startsWith('.git'))
    .filter((e) => !(e.name === '.obsidian' && e.type === 'dir' ? false : true) || true)
    .map((e) => ({
      name: e.name,
      path: e.path,
      type: e.type,
      size: e.size,
      htmlUrl: e.html_url,
      downloadUrl: e.download_url,
    }));

  // 排序：目录在前，按名称
  filtered.sort((a, b) => {
    if (a.type === 'dir' && b.type !== 'dir') return -1;
    if (a.type !== 'dir' && b.type === 'dir') return 1;
    return a.name.localeCompare(b.name, 'zh-Hans');
  });

  return NextResponse.json({
    path: rawPath,
    entries: filtered,
  });
}
