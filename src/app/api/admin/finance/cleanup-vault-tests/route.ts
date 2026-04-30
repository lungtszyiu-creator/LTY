/**
 * Vault TEST 文件清理 API（仅老板用）
 *
 * POST /api/admin/finance/cleanup-vault-tests
 * Body: { confirm: true, dryRun?: boolean }
 *
 * 用 GitHub Contents API 列 lty-vault `raw/ai_reports/<role>/`，
 * 删除文件名匹配"test...connectivity"模式的 TEST 归档（5 角色 × 1+ 个）。
 *
 * 不会动正常归档文件 —— 严格匹配 `-test-` AND `connectivity` 双关键词。
 *
 * 复用现有 GITHUB_VAULT_TOKEN env（已有 Contents Read+Write 权限）。
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireFinanceEditSession } from '@/lib/finance-access';

const VAULT_OWNER = 'lungtszyiu-creator';
const VAULT_REPO = 'lty-vault';
const ENTRY_DIR = 'raw/ai_reports';
const ROLES = ['voucher_clerk', 'chain_bookkeeper', 'forex_lookout', 'reconciler', 'cfo'];

type GhFile = { name: string; path: string; type: string; sha: string };

function isTestFile(name: string): boolean {
  const lower = name.toLowerCase();
  // 双关键词同时命中才算 TEST：避免误伤含 "test" 单词的正常文件
  return /(^|-)test-/.test(lower) && /connectivity/.test(lower);
}

async function ghJson<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub ${res.status} ${url}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function POST(req: NextRequest) {
  const auth = await requireFinanceEditSession();
  if (auth instanceof NextResponse) return auth;

  const token = process.env.GITHUB_VAULT_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'VAULT_TOKEN_NOT_CONFIGURED' },
      { status: 500 },
    );
  }

  let body: { confirm?: boolean; dryRun?: boolean };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (!body.confirm && !body.dryRun) {
    return NextResponse.json(
      { error: 'CONFIRM_REQUIRED', message: 'Pass {"confirm": true} or {"dryRun": true}.' },
      { status: 400 },
    );
  }

  // 列各 role 子目录，找 TEST 文件
  const allTestFiles: Array<{ role: string; file: GhFile }> = [];
  for (const role of ROLES) {
    const url = `https://api.github.com/repos/${VAULT_OWNER}/${VAULT_REPO}/contents/${ENTRY_DIR}/${role}`;
    let files: GhFile[];
    try {
      files = await ghJson<GhFile[]>(url, token);
    } catch (e) {
      // 子目录可能不存在（角色还没 archive 过），跳过
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('404')) continue;
      return NextResponse.json(
        { error: 'GITHUB_LIST_FAILED', role, message: msg },
        { status: 502 },
      );
    }
    for (const f of files) {
      if (f.type === 'file' && isTestFile(f.name)) {
        allTestFiles.push({ role, file: f });
      }
    }
  }

  if (body.dryRun) {
    return NextResponse.json({
      dryRun: true,
      wouldDelete: allTestFiles.map(({ role, file }) => ({
        role,
        name: file.name,
        path: file.path,
      })),
      count: allTestFiles.length,
    });
  }

  // 真删（GitHub DELETE /contents/{path} 需 sha）
  const deleted: Array<{ role: string; path: string; commitSha?: string }> = [];
  const failed: Array<{ role: string; path: string; error: string }> = [];

  for (const { role, file } of allTestFiles) {
    const url = `https://api.github.com/repos/${VAULT_OWNER}/${VAULT_REPO}/contents/${encodeURIComponent(file.path).replace(/%2F/g, '/')}`;
    try {
      const res = await ghJson<{ commit?: { sha?: string } }>(url, token, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `cleanup: 删除 ${role} 的 TEST 归档 ${file.name}`,
          sha: file.sha,
        }),
      });
      deleted.push({ role, path: file.path, commitSha: res.commit?.sha });
    } catch (e) {
      failed.push({ role, path: file.path, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({
    deleted,
    failed,
    counts: { deleted: deleted.length, failed: failed.length, total: allTestFiles.length },
  });
}
