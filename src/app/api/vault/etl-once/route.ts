/**
 * 一次性 vault → 看板 ETL 入口
 *
 * POST /api/vault/etl-once
 *   body: { dryRun?: boolean }  // 默认 true (dry-run，不写库仅报告)
 *
 * 鉴权：仅 SUPER_ADMIN — 这是数据写入操作，不让普通 ADMIN 跑。
 *
 * 真跑会：
 *   - 给 vault 员工花名册 27 人建/更新 User + HrEmployeeProfile + EmployeePayrollProfile
 *   - 给 wallet_*.md (老板主 + 出纳) 建/更新 CryptoWallet
 *   - 给 bank_*.md (3 个) 建/更新 BankAccount
 *
 * 跑多次安全（upsert by 自然键）。
 * 每次跑完写一行 AiActivityLog action="vault_etl_run"。
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/permissions';
import { runVaultEtl } from '@/lib/vault-etl';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // ETL 跑多个 GitHub API 拉 + N 次 prisma 写，给 60s

const bodySchema = z.object({ dryRun: z.boolean().optional().default(true) });

export async function POST(req: NextRequest) {
  const admin = await requireSuperAdmin();
  let body;
  try {
    body = bodySchema.parse((await req.json().catch(() => ({}))));
  } catch {
    body = { dryRun: true };
  }

  const report = await runVaultEtl({ dryRun: body.dryRun });

  // 留 audit 痕（dry-run 也记，方便老板回溯每次"看看会改啥"）
  await prisma.aiActivityLog.create({
    data: {
      aiRole: 'system',
      action: body.dryRun ? 'vault_etl_dryrun' : 'vault_etl_run',
      status: 'success',
      payload: JSON.stringify({
        triggeredBy: admin.id,
        report: {
          employees: report.employees,
          payroll: report.payroll,
          hrProfile: report.hrProfile,
          wallets: report.wallets,
          banks: report.banks,
          durationMs: report.durationMs,
        },
      }),
      dashboardWritten: true,
    },
  });

  return NextResponse.json({ ok: true, report });
}
