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
const HR_SALARY_TABLE_PATH = 'wiki/topics/topic_HR薪资结构表.md';

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

/** 从 wiki/topics/topic_HR薪资结构表.md 解析 markdown 表格，按英文名匹配回填薪资。
 *
 * 返回 Map<englishName_lower, {monthlySalary, currency, probation}>。
 * 月薪取转正后金额（实际应得），试用期标记另存。
 */
function parseHrSalaryTable(md: string): Map<string, { monthlySalary: number; currency: string }> {
  const out = new Map<string, { monthlySalary: number; currency: string }>();
  // 匹配 markdown 表格行：| 中文名 | 英文名 | ... | 转正后金额 | 备注 |
  const lines = md.split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith('|') || !line.includes('|')) continue;
    const cells = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length < 3) continue;
    // 跳过表头分隔行 (|---|---|...)
    if (cells.every((c) => /^[-:]+$/.test(c))) continue;
    // 跳过表头行（含"员工"/"英文名"等关键字）
    if (cells.some((c) => c === '员工' || c === '英文名')) continue;

    const chinese = cells[0];
    const english = cells[1];
    if (!english || english === '—' || english.startsWith('（') || /^\s*$/.test(english)) continue;

    // 找含"USD"/"HKD"/"RMB"/数字的单元格 — 取转正金额（最后一个含金额的）
    const amountRegex = /\*?\*?([\d,]+(?:\.\d+)?)\s*(USD|HKD|RMB|CNY|港币|港元|人民币|美元)?\*?\*?/i;
    let lastAmount: { value: number; currency: string } | null = null;
    for (let i = 2; i < cells.length; i++) {
      const m = cells[i].match(amountRegex);
      if (!m) continue;
      const num = parseFloat(m[1].replace(/,/g, ''));
      if (!Number.isFinite(num) || num < 100) continue; // 过滤年份/小数字
      let currency = (m[2] ?? '').toUpperCase();
      if (currency === '人民币' || currency === '') currency = 'CNY';
      else if (currency === 'RMB') currency = 'CNY';
      else if (currency === '港币' || currency === '港元') currency = 'HKD';
      else if (currency === '美元') currency = 'USD';
      lastAmount = { value: num, currency };
    }
    if (!lastAmount) continue;

    const key = english.replace(/\([^)]*\)/g, '').trim().toLowerCase();
    if (!key) continue;
    out.set(key, { monthlySalary: lastAmount.value, currency: lastAmount.currency });
  }
  return out;
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
  const employeeFiles = files.filter((f) => f.type === 'file' && /^employee_.*\.md$/i.test(f.name));

  // 拉取 HR 薪资结构表（best-effort，失败不阻塞 employee 同步）
  let salaryMap = new Map<string, { monthlySalary: number; currency: string }>();
  try {
    const salaryFile = await ghJson<{ download_url?: string }>(
      `https://api.github.com/repos/${VAULT_OWNER}/${VAULT_REPO}/contents/${encodeURIComponent(HR_SALARY_TABLE_PATH).replace(/%2F/g, '/')}`,
      token,
    );
    if (salaryFile.download_url) {
      const md = await ghFileText(salaryFile.download_url, token);
      salaryMap = parseHrSalaryTable(md);
    }
  } catch {
    // ok：薪资表不存在不影响 employee sync
  }

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

  // employee_*.md 解析（独立于 User 的 vault 花名册镜像）
  const employees = await Promise.all(
    employeeFiles.map(async (f) => {
      if (!f.download_url) return null;
      const md = await ghFileText(f.download_url, token);
      const fm = parseFrontmatter(md);
      // title 拆中英文："夏雨梅 (cici)" → ["夏雨梅", "cici"]
      const titleStr = fm.title ?? f.name.replace(/^employee_/, '').replace(/\.md$/, '');
      const titleMatch = titleStr.match(/^([^()（]+?)\s*[（(]([^）)]+)[）)]\s*$/);
      const chineseName = titleMatch ? titleMatch[1].trim() : titleStr.trim();
      const englishName = titleMatch ? titleMatch[2].trim() : null;

      // 状态：md body 提到 离职/前员工 → RESIGNED
      const status = /离职|前员工|resign/i.test(md) ? 'RESIGNED' : 'ACTIVE';

      // 从薪资表反查（按英文名 lowercase 匹配）
      const salaryHit = englishName ? salaryMap.get(englishName.toLowerCase()) : null;

      return {
        sourcePath: `${ENTITIES_DIR}/${f.name}`,
        raw: fm,
        mapped: {
          vaultPath: `${ENTITIES_DIR}/${f.name}`,
          title: titleStr,
          chineseName,
          englishName,
          employmentType: fm.employment_type ?? null,
          roles: null,
          status,
          monthlySalary: salaryHit?.monthlySalary ?? null,
          currency: salaryHit?.currency ?? null,
          probation: false,
          linkedUserId: null,
          rawFrontmatter: JSON.stringify(fm).slice(0, 4000),
        },
      };
    }),
  );

  const validWallets = wallets.filter((w): w is NonNullable<typeof w> => !!w && !!w.mapped.address);
  const validBanks = banks.filter((b): b is NonNullable<typeof b> => !!b && !!b.mapped.accountNumber);
  const validEmployees = employees.filter((e): e is NonNullable<typeof e> => !!e && !!e.mapped.title);

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      wallets: validWallets.map((w) => w.mapped),
      banks: validBanks.map((b) => b.mapped),
      employees: validEmployees.map((e) => e.mapped),
      counts: {
        wallets: validWallets.length,
        banks: validBanks.length,
        employees: validEmployees.length,
        salaryRowsParsed: salaryMap.size,
      },
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

  const employeeResults = await Promise.all(
    validEmployees.map((e) =>
      prisma.hrRoster.upsert({
        where: { vaultPath: e.mapped.vaultPath },
        create: e.mapped,
        update: { ...e.mapped, syncedAt: new Date() },
        select: {
          id: true,
          title: true,
          chineseName: true,
          englishName: true,
          status: true,
          employmentType: true,
          monthlySalary: true,
          currency: true,
        },
      }),
    ),
  );

  return NextResponse.json({
    imported: {
      wallets: walletResults,
      banks: bankResults,
      employees: employeeResults,
      counts: {
        wallets: walletResults.length,
        banks: bankResults.length,
        employees: employeeResults.length,
        salaryRowsParsed: salaryMap.size,
      },
    },
  });
}
