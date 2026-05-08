/**
 * lty-vault → 看板 DB 一次性 ETL
 * ============================================
 *
 * 老板说的"vault 真实数据导入"。范围：
 *   - 员工花名册 27 人 → User (placeholder) + HrEmployeeProfile + EmployeePayrollProfile
 *   - wallet_*.md (老板主 + 出纳) → CryptoWallet
 *   - bank_*.md (3 个) → BankAccount
 *
 * 设计：upsert by 自然键，跑多次安全：
 *   - User: email = `vault-r<行号>@placeholder.lty.local`（行号永远 unique）
 *   - CryptoWallet: (chain, address) 唯一
 *   - BankAccount: (bankName, accountNumber) 唯一
 *
 * 限制（vault 还没结构化的不导）：
 *   - 凭证 / 链上交易 / 银行流水 / 法币汇率：vault entity 没有，等 raw/ ingest
 *   - company entities：看板没 Company 表，跳过
 *
 * dry-run 模式：跑完不写库，仅返报告，给老板确认范围用。
 */
import { prisma } from './db';
import { fetchVaultText, fetchVaultDir } from './vault-client';

// ============ frontmatter 解析（迷你版 yaml） ============

type FrontmatterValue = string | string[] | boolean | null;

/** 极简 yaml frontmatter 解析：只支持 key: value 和 key:\n  - item 列表 */
export function parseFrontmatter(text: string): {
  data: Record<string, FrontmatterValue>;
  body: string;
} {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: text };
  const yaml = match[1];
  const body = match[2];

  const data: Record<string, FrontmatterValue> = {};
  const lines = yaml.split(/\r?\n/);
  let currentListKey: string | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line) continue;
    // list item: 缩进 - value
    const listMatch = line.match(/^\s+-\s+(.*)$/);
    if (listMatch && currentListKey) {
      (data[currentListKey] as string[]).push(stripQuotes(listMatch[1]));
      continue;
    }
    // key: value
    const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (kv) {
      const key = kv[1];
      const val = kv[2].trim();
      if (val === '') {
        // 列表开始
        currentListKey = key;
        data[key] = [];
      } else {
        currentListKey = null;
        data[key] = parseScalar(val);
      }
    }
  }

  return { data, body };
}

function stripQuotes(s: string): string {
  return s.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
}

function parseScalar(s: string): FrontmatterValue {
  const t = stripQuotes(s);
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null' || t === '~') return null;
  return t;
}

// ============ 员工花名册表格解析 ============

export type RosterRow = {
  rowIndex: number; // 花名册"序号"列，自然主键
  zhName: string;
  enName: string | null;
  status: 'ACTIVE' | 'RESIGNED' | 'PROBATION' | 'UNKNOWN';
  employmentType: 'FULL_TIME' | 'CONTRACTOR' | 'UNKNOWN';
  walletAddress: string | null; // 0x... ERC-20
  signatureConfirmed: boolean;
  salaryCurrency: 'USD' | 'CNY' | 'HKD' | null;
  rawNotes: string; // 原始合同类型字段（含详情链接）
};

const ETH_ADDR_RE = /0x[0-9a-fA-F]{40}/;

/** 把 "**夏雨梅**" / "[[xxx]]" 等 markdown 标记去掉 */
function stripMd(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[\[([^\]]+?)\]\]/g, '$1')
    .replace(/\[([^\]]+?)\]\([^)]+\)/g, '$1')
    .trim();
}

function classifyEmploymentType(s: string): RosterRow['employmentType'] {
  // "雇佣"/"雇佣合同" → FULL_TIME（港岛全职）
  // "服务"/"服务合同" → CONTRACTOR
  // "双合同" → CONTRACTOR（许荣达 SZ 转岗，含服务部分）
  // "⏸️" / "待确认" → UNKNOWN
  const t = stripMd(s);
  if (/雇佣/.test(t) && !/双合同/.test(t)) return 'FULL_TIME';
  if (/服务/.test(t) || /双合同/.test(t)) return 'CONTRACTOR';
  return 'UNKNOWN';
}

function classifyStatus(s: string): RosterRow['status'] {
  const t = stripMd(s);
  if (/在职/.test(t)) return 'ACTIVE';
  if (/离职/.test(t)) return 'RESIGNED';
  if (/试用/.test(t)) return 'PROBATION';
  return 'UNKNOWN';
}

function classifyCurrency(s: string): RosterRow['salaryCurrency'] {
  const t = stripMd(s).toUpperCase();
  if (t === 'USD' || /USD/.test(t)) return 'USD';
  if (t === 'CNY' || /CNY/.test(t)) return 'CNY';
  if (t === 'HKD' || /HKD/.test(t)) return 'HKD';
  return null;
}

/** 解析员工花名册 markdown 表格行 */
export function parseRosterTable(body: string): RosterRow[] {
  const rows: RosterRow[] = [];
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    // 表格行以 | 开头 + 第一格是数字（序号）
    if (!/^\|\s*\d+\s*\|/.test(line)) continue;
    const cells = line
      .split('|')
      .slice(1, -1) // 去掉前后空段
      .map((c) => c.trim());
    if (cells.length < 7) continue;

    const [idxStr, zhName, enName, status, employmentType, wallet, sigConfirmed, salaryCurrency = ''] =
      cells;
    const rowIndex = parseInt(idxStr, 10);
    if (!Number.isFinite(rowIndex)) continue;

    const walletMatch = wallet.match(ETH_ADDR_RE);
    const cleanZh = stripMd(zhName);
    const cleanEn = stripMd(enName);

    rows.push({
      rowIndex,
      zhName: cleanZh || `员工${rowIndex}`,
      enName: cleanEn && cleanEn !== '-' ? cleanEn : null,
      status: classifyStatus(status),
      employmentType: classifyEmploymentType(employmentType),
      walletAddress: walletMatch ? walletMatch[0].toLowerCase() : null,
      signatureConfirmed: /✅/.test(sigConfirmed),
      salaryCurrency: classifyCurrency(salaryCurrency),
      rawNotes: stripMd(employmentType),
    });
  }
  return rows;
}

// ============ ETL 入口 ============

export type EtlReport = {
  dryRun: boolean;
  employees: { created: number; updated: number; skipped: number; errors: string[] };
  payroll: { created: number; updated: number; skipped: number; errors: string[] };
  hrProfile: { created: number; updated: number; skipped: number; errors: string[] };
  wallets: { created: number; updated: number; skipped: number; errors: string[] };
  banks: { created: number; updated: number; skipped: number; errors: string[] };
  durationMs: number;
};

function emptyBucket() {
  return { created: 0, updated: 0, skipped: 0, errors: [] as string[] };
}

export async function runVaultEtl(opts: { dryRun: boolean }): Promise<EtlReport> {
  const start = Date.now();
  const report: EtlReport = {
    dryRun: opts.dryRun,
    employees: emptyBucket(),
    payroll: emptyBucket(),
    hrProfile: emptyBucket(),
    wallets: emptyBucket(),
    banks: emptyBucket(),
    durationMs: 0,
  };

  // 1. 员工花名册 → User + HrEmployeeProfile + EmployeePayrollProfile
  await importEmployees(report, opts.dryRun);

  // 2. 独立钱包 entity（老板主钱包 / 出纳钱包） → CryptoWallet
  await importStandaloneWallets(report, opts.dryRun);

  // 3. 银行账户 → BankAccount
  await importBankAccounts(report, opts.dryRun);

  report.durationMs = Date.now() - start;
  return report;
}

// ============ 各 importer ============

async function importEmployees(report: EtlReport, dryRun: boolean) {
  const text = await fetchVaultText('wiki/entities/员工花名册.md');
  if (!text) {
    report.employees.errors.push('员工花名册.md 拉不到（VAULT_GITHUB_TOKEN 缺失或文件不存在）');
    return;
  }
  const rows = parseRosterTable(text);
  if (rows.length === 0) {
    report.employees.errors.push('解析不到任何员工行（表格格式可能变了）');
    return;
  }

  for (const row of rows) {
    try {
      const email = `vault-r${row.rowIndex}@placeholder.lty.local`;
      const userName = row.enName ? `${row.zhName} (${row.enName})` : row.zhName;
      const userActive = row.status === 'ACTIVE' || row.status === 'PROBATION';

      // 1) User upsert
      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, active: true },
      });
      let userId: string;
      if (existingUser) {
        if (!dryRun) {
          await prisma.user.update({
            where: { email },
            data: {
              name: userName,
              // 真跑时不强制覆盖 active（老板可能已手动改过），仅当还是
              // placeholder 状态时才同步
              ...(existingUser.name?.startsWith('vault-')
                ? { active: false }
                : {}),
            },
          });
        }
        userId = existingUser.id;
        report.employees.updated++;
      } else {
        if (dryRun) {
          userId = `<DRY-RUN-NEW-${row.rowIndex}>`;
        } else {
          const created = await prisma.user.create({
            data: {
              email,
              name: userName,
              role: 'MEMBER',
              active: false, // placeholder 不允许登录
            },
            select: { id: true },
          });
          userId = created.id;
        }
        report.employees.created++;
      }

      if (dryRun) continue; // dry-run 不动 HR/Payroll

      // 2) HrEmployeeProfile upsert
      const hrStatusMap: Record<RosterRow['status'], string> = {
        ACTIVE: 'ACTIVE',
        RESIGNED: 'RESIGNED',
        PROBATION: 'PROBATION',
        UNKNOWN: 'ACTIVE',
      };
      const hrEmpType =
        row.employmentType === 'FULL_TIME'
          ? 'FULL_TIME'
          : row.employmentType === 'CONTRACTOR'
          ? 'CONTRACTOR'
          : 'FULL_TIME';
      const existingHr = await prisma.hrEmployeeProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (existingHr) {
        await prisma.hrEmployeeProfile.update({
          where: { userId },
          data: {
            employmentType: hrEmpType,
            status: hrStatusMap[row.status],
            notes: row.rawNotes || null,
          },
        });
        report.hrProfile.updated++;
      } else {
        await prisma.hrEmployeeProfile.create({
          data: {
            userId,
            employmentType: hrEmpType,
            workLocation: row.employmentType === 'FULL_TIME' ? 'ONSITE' : 'REMOTE',
            status: hrStatusMap[row.status],
            notes: row.rawNotes || null,
          },
        });
        report.hrProfile.created++;
      }

      // 3) EmployeePayrollProfile upsert（钱包 + 工资币种 + 签名）
      const existingPay = await prisma.employeePayrollProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      const payData = {
        cryptoAddress: row.walletAddress,
        cryptoChain: row.walletAddress ? 'ETH' : null,
        salaryCurrency: row.salaryCurrency,
        signatureConfirmed: row.signatureConfirmed,
        effectiveUntil: row.status === 'RESIGNED' ? new Date() : null,
      };
      if (existingPay) {
        await prisma.employeePayrollProfile.update({
          where: { userId },
          data: payData,
        });
        report.payroll.updated++;
      } else {
        await prisma.employeePayrollProfile.create({
          data: { userId, ...payData },
        });
        report.payroll.created++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      report.employees.errors.push(`row${row.rowIndex} (${row.zhName}): ${msg}`);
    }
  }
}

async function importStandaloneWallets(report: EtlReport, dryRun: boolean) {
  // 列 wiki/entities/ 下所有 wallet_*.md
  const entries = await fetchVaultDir('wiki/entities');
  if (!entries) {
    report.wallets.errors.push('wiki/entities/ 拉不到列表');
    return;
  }
  const walletFiles = entries.filter(
    (e) => e.type === 'file' && e.name.startsWith('wallet_') && e.name.endsWith('.md'),
  );

  for (const f of walletFiles) {
    try {
      const text = await fetchVaultText(f.path);
      if (!text) {
        report.wallets.errors.push(`${f.name}: 拉不到内容`);
        continue;
      }
      const { data } = parseFrontmatter(text);
      const address = typeof data.address === 'string' ? data.address.toLowerCase() : null;
      const chain = inferChain(typeof data.chain === 'string' ? data.chain : '');
      const label = typeof data.title === 'string' ? data.title : f.name.replace(/^wallet_|\.md$/g, '');
      const holderType = inferHolderType(typeof data.holder === 'string' ? data.holder : '', f.name);
      const purpose = typeof data.purpose === 'string' ? data.purpose : null;
      const isActive = (typeof data.status === 'string' ? data.status : '').toLowerCase() === 'active';

      if (!address || !/0x[0-9a-fA-F]{40}/.test(address)) {
        report.wallets.errors.push(`${f.name}: 地址解析失败 (${data.address ?? '无 address 字段'})`);
        continue;
      }

      const existing = await prisma.cryptoWallet.findUnique({
        where: { chain_address: { chain, address } },
        select: { id: true },
      });
      if (existing) {
        if (!dryRun) {
          await prisma.cryptoWallet.update({
            where: { id: existing.id },
            data: { label, holderType, purpose, isActive, vaultPath: f.path },
          });
        }
        report.wallets.updated++;
      } else {
        if (!dryRun) {
          await prisma.cryptoWallet.create({
            data: {
              label,
              chain,
              address,
              holderType,
              purpose,
              isActive,
              vaultPath: f.path,
              autoMonitor: holderType !== 'BOSS', // 老板个人钱包混私事，不自动监控
            },
          });
        }
        report.wallets.created++;
      }
    } catch (e) {
      report.wallets.errors.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

function inferChain(raw: string): string {
  const t = raw.toUpperCase();
  if (/ETH|ERC|MAINNET/.test(t)) return 'ETH';
  if (/TRON|TRC/.test(t)) return 'TRON';
  if (/SOL/.test(t)) return 'SOL';
  return 'ETH'; // fallback
}

function inferHolderType(holder: string, filename: string): string {
  if (/老板|boss|yoyo/i.test(holder + filename)) return 'BOSS';
  if (/出纳|cashier/i.test(holder + filename)) return 'COMPANY_CASHIER';
  if (/treasury|储备/i.test(holder + filename)) return 'TREASURY';
  return 'EXTERNAL';
}

async function importBankAccounts(report: EtlReport, dryRun: boolean) {
  const entries = await fetchVaultDir('wiki/entities');
  if (!entries) {
    report.banks.errors.push('wiki/entities/ 拉不到列表');
    return;
  }
  const bankFiles = entries.filter(
    (e) => e.type === 'file' && e.name.startsWith('bank_') && e.name.endsWith('.md'),
  );

  for (const f of bankFiles) {
    try {
      const text = await fetchVaultText(f.path);
      if (!text) {
        report.banks.errors.push(`${f.name}: 拉不到内容`);
        continue;
      }
      const { data } = parseFrontmatter(text);
      const bankName = typeof data.bank === 'string' ? data.bank : '未知';
      const accountNumber =
        typeof data.account_number === 'string' ? data.account_number : '';
      const label =
        typeof data.title === 'string'
          ? data.title.replace(/银行$/, '').replace(/账户$/, '').trim() || data.title
          : f.name.replace(/^bank_|\.md$/g, '');
      const accountType = inferBankAccountType(
        typeof data.account_type === 'string' ? data.account_type : '',
      );
      const currency = inferCurrency(typeof data.currency === 'string' ? data.currency : '');
      const isActive = (typeof data.status === 'string' ? data.status : '').toLowerCase() === 'active';
      const purpose = typeof data.purpose === 'string' ? data.purpose : null;

      if (!accountNumber) {
        report.banks.errors.push(`${f.name}: account_number 字段为空`);
        continue;
      }

      const existing = await prisma.bankAccount.findUnique({
        where: { bankName_accountNumber: { bankName, accountNumber } },
        select: { id: true },
      });
      if (existing) {
        if (!dryRun) {
          await prisma.bankAccount.update({
            where: { id: existing.id },
            data: { label, accountType, currency, isActive, notes: purpose, vaultPath: f.path },
          });
        }
        report.banks.updated++;
      } else {
        if (!dryRun) {
          await prisma.bankAccount.create({
            data: {
              label,
              bankName,
              accountType,
              accountNumber,
              currency,
              isActive,
              notes: purpose,
              vaultPath: f.path,
            },
          });
        }
        report.banks.created++;
      }
    } catch (e) {
      report.banks.errors.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

function inferBankAccountType(raw: string): string {
  const t = raw;
  if (/基本/.test(t)) return 'BASIC';
  if (/资本/.test(t)) return 'CAPITAL';
  if (/工资|payroll/i.test(t)) return 'PAYROLL';
  if (/外汇|FX|fx/.test(t)) return 'FX';
  return 'GENERAL';
}

function inferCurrency(raw: string): string {
  const t = raw.toUpperCase();
  if (/HKD/.test(t)) return 'HKD';
  if (/USD/.test(t)) return 'USD';
  if (/RMB|CNY/.test(t)) return 'RMB';
  return 'RMB'; // fallback
}
