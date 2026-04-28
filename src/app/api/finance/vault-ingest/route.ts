/**
 * Vault → Dashboard 主数据导入
 *
 * POST /api/finance/vault-ingest
 * Body: { dryRun?: boolean }
 *
 * 从 GitHub lty-vault repo 的 `wiki/entities/` 目录读取所有 wallet_*.md 和
 * bank_*.md，解析 YAML frontmatter，upsert 到 CryptoWallet / BankAccount 表。
 *
 * - 钱包按 (chain, address) upsert
 * - 银行账户按 (bankName, accountNumber) upsert
 * - dryRun=true 只返回会导入什么，不写库
 *
 * 仅 EDITOR 可调（老板）。
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFinanceEditSession } from '@/lib/finance-access';

const VAULT_OWNER = 'lungtszyiu-creator';
const VAULT_REPO = 'lty-vault';
const ENTITIES_DIR = 'wiki/entities';

type GhFile = { name: string; path: string; type: string; download_url: string | null };

// 简易 frontmatter 解析（够用：跳过列表，只取 scalar k/v）
function parseFrontmatter(md: string): Record<string, string> {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const rawLine of m[1].split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || /^\s*-\s/.test(line)) continue; // 跳过列表项 / 空行
    const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    // 去引号
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[kv[1]] = v;
  }
  return out;
}

// 去掉 "(推测)" / "(待确认)" / "(待澄清)" / "（推测）" 等中英括号注释
function stripParenNotes(s: string): string {
  return s.replace(/[（(][^）)]*[）)]/g, '').trim();
}

function inferChainKey(s: string): string {
  // "ETH (ERC-20)" → "ETH"; "TRON" → "TRON"; ...
  const cleaned = stripParenNotes(s).split(/\s+/)[0]?.toUpperCase() ?? '';
  return cleaned || 'ETH';
}

function inferHolderType(holder: string): 'BOSS' | 'COMPANY_CASHIER' | 'EMPLOYEE' | 'TREASURY' | 'EXTERNAL' {
  const h = holder ?? '';
  if (/老板|创始人|founder|boss/i.test(h)) return 'BOSS';
  if (/出纳|cashier/i.test(h)) return 'COMPANY_CASHIER';
  if (/员工|employee|staff/i.test(h)) return 'EMPLOYEE';
  if (/储备|treasury|金库/i.test(h)) return 'TREASURY';
  return 'EXTERNAL';
}

function inferAccountType(t: string): 'BASIC' | 'CAPITAL' | 'GENERAL' | 'PAYROLL' | 'FX' {
  const x = stripParenNotes(t);
  if (/基本/.test(x)) return 'BASIC';
  if (/资本/.test(x)) return 'CAPITAL';
  if (/工资|薪酬|payroll/i.test(x)) return 'PAYROLL';
  if (/外汇|fx|forex/i.test(x)) return 'FX';
  if (/一般|general/i.test(x)) return 'GENERAL';
  return 'GENERAL';
}

function inferCurrency(s: string): string {
  const x = stripParenNotes(s).toUpperCase();
  if (/RMB|CNY|人民币/i.test(x)) return 'CNY';
  if (/HKD|港币|港元/i.test(x)) return 'HKD';
  if (/USD|美元/i.test(x)) return 'USD';
  if (/USDT/i.test(x)) return 'USDT';
  if (/USDC/i.test(x)) return 'USDC';
  return x || 'CNY';
}

async function ghJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub ${res.status}: ${errText.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function ghFileText(downloadUrl: string, token: string): Promise<string> {
  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Download ${res.status}`);
  return res.text();
}

export async function POST(req: NextRequest) {
  const auth = await requireFinanceEditSession();
  if (auth instanceof NextResponse) return auth;

  const token = process.env.GITHUB_VAULT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'VAULT_TOKEN_NOT_CONFIGURED' }, { status: 500 });
  }

  let body: { dryRun?: boolean };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const dryRun = !!body.dryRun;

  // 列目录
  let files: GhFile[];
  try {
    files = await ghJson<GhFile[]>(
      `https://api.github.com/repos/${VAULT_OWNER}/${VAULT_REPO}/contents/${ENTITIES_DIR}`,
      token,
    );
  } catch (e) {
    return NextResponse.json(
      { error: 'GITHUB_LIST_FAILED', message: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  const walletFiles = files.filter((f) => f.type === 'file' && /^wallet_.*\.md$/i.test(f.name));
  const bankFiles = files.filter((f) => f.type === 'file' && /^bank_.*\.md$/i.test(f.name));

  // 拉文件 + 解析
  const wallets = await Promise.all(
    walletFiles.map(async (f) => {
      if (!f.download_url) return null;
      const md = await ghFileText(f.download_url, token);
      const fm = parseFrontmatter(md);
      return {
        sourcePath: `${ENTITIES_DIR}/${f.name}`,
        raw: fm,
        mapped: {
          label: fm.title || f.name.replace(/\.md$/, ''),
          chain: inferChainKey(fm.chain ?? ''),
          address: fm.address ?? '',
          holderType: inferHolderType(fm.holder ?? ''),
          purpose: stripParenNotes(fm.purpose ?? '') || null,
          vaultPath: `${ENTITIES_DIR}/${f.name}`,
          isActive: (fm.status ?? '').toLowerCase() === 'active',
          notes: fm.holder
            ? `从 vault 同步：holder=${fm.holder}${fm.tags ? ` / tags=${fm.tags}` : ''}`
            : null,
        },
      };
    }),
  );

  const banks = await Promise.all(
    bankFiles.map(async (f) => {
      if (!f.download_url) return null;
      const md = await ghFileText(f.download_url, token);
      const fm = parseFrontmatter(md);
      return {
        sourcePath: `${ENTITIES_DIR}/${f.name}`,
        raw: fm,
        mapped: {
          label: fm.title || f.name.replace(/\.md$/, ''),
          bankName: stripParenNotes(fm.bank ?? '') || '未知',
          accountType: inferAccountType(fm.account_type ?? ''),
          accountNumber: fm.account_number ?? '',
          currency: inferCurrency(fm.currency ?? ''),
          vaultPath: `${ENTITIES_DIR}/${f.name}`,
          isActive: (fm.status ?? '').toLowerCase() === 'active',
          notes: fm.purpose ? `用途：${stripParenNotes(fm.purpose)}` : null,
        },
      };
    }),
  );

  const validWallets = wallets.filter((w): w is NonNullable<typeof w> => !!w && !!w.mapped.address);
  const validBanks = banks.filter((b): b is NonNullable<typeof b> => !!b && !!b.mapped.accountNumber);

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      wallets: validWallets.map((w) => w.mapped),
      banks: validBanks.map((b) => b.mapped),
      counts: { wallets: validWallets.length, banks: validBanks.length },
    });
  }

  // upsert
  const walletResults = await Promise.all(
    validWallets.map((w) =>
      prisma.cryptoWallet.upsert({
        where: { chain_address: { chain: w.mapped.chain, address: w.mapped.address } },
        create: w.mapped,
        update: w.mapped,
        select: { id: true, label: true, chain: true, address: true },
      }),
    ),
  );
  const bankResults = await Promise.all(
    validBanks.map((b) =>
      prisma.bankAccount.upsert({
        where: {
          bankName_accountNumber: { bankName: b.mapped.bankName, accountNumber: b.mapped.accountNumber },
        },
        create: b.mapped,
        update: b.mapped,
        select: { id: true, label: true, bankName: true, accountNumber: true },
      }),
    ),
  );

  return NextResponse.json({
    imported: {
      wallets: walletResults,
      banks: bankResults,
      counts: { wallets: walletResults.length, banks: bankResults.length },
    },
  });
}
