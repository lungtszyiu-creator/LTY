/**
 * /admin/vault-etl — 一次性把 lty-vault 真实数据灌进看板 DB
 *
 * 老板原话："想把现在 obsidian 的真实数据导入到看板内 不然现在看板没有
 * 真实的数据"。
 *
 * 范围（vault 里已结构化 + 看板有对应表的数据）：
 *   - 员工花名册 27 人 → User (placeholder) + HrEmployeeProfile + EmployeePayrollProfile
 *   - wallet_*.md → CryptoWallet (老板主 + 出纳)
 *   - bank_*.md → BankAccount (工商基本/资本/宁波)
 *
 * 不在范围（vault 还没结构化的）：凭证 / 链上交易 / 法币汇率 / 银行流水 / 法务工单 / 资产 / 证照
 *
 * 跑多次安全：upsert by 自然键 (User.email / wallet.chain+address / bank.bankName+number)
 *
 * 权限：仅 SUPER_ADMIN。
 */
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { EtlClient } from './_components/EtlClient';

export const dynamic = 'force-dynamic';

export default async function VaultEtlPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Vault → 看板 一次性导入
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          把 lty-vault 里已结构化的真实数据（员工花名册 / 钱包 / 银行账户）一次性灌进看板 DB。
        </p>
      </header>

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          导入范围
        </h2>
        <ul className="space-y-1.5 text-slate-700">
          <li>
            ✅ <strong>员工花名册 27 人</strong> → User + HrEmployeeProfile + EmployeePayrollProfile
            <span className="ml-2 text-[11px] text-slate-500">
              （placeholder email：vault-r&lt;行号&gt;@placeholder.lty.local，active=false 不能登录）
            </span>
          </li>
          <li>
            ✅ <strong>独立钱包 entity</strong>（老板主 / 出纳）→ CryptoWallet
          </li>
          <li>
            ✅ <strong>银行账户 3 个</strong>（工商基本 / 工商资本 / 宁波基本）→ BankAccount
          </li>
        </ul>
        <h2 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          不在范围（vault 还没结构化）
        </h2>
        <ul className="space-y-1 text-[12px] text-slate-500">
          <li>· 财务凭证 / 链上交易 / 银行流水 / 法币汇率（这些数据还在 raw/ Excel/PDF 里没 ingest）</li>
          <li>· 法务工单 / 资产 / 证照 / 报销 / 对账</li>
          <li>→ 等仓库员把 raw/ ingest 进 vault 后，下次再跑</li>
        </ul>
      </section>

      <section className="mb-5 rounded-xl border border-amber-300 bg-amber-100/50 p-4 text-sm text-amber-900">
        <strong>建议先跑 Dry-run</strong> — 看会建/更新多少行，确认范围合理后再真跑。
        跑多次安全（upsert by 自然键），不会重复建数据。
      </section>

      <EtlClient />
    </div>
  );
}
