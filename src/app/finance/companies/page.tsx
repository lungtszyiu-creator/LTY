/**
 * /finance/companies — Vault 公司实体清单
 *
 * 展示 VaultCompanyMirror 表 — 12+ 个 LTY 系实体（含家属）
 * 数据源：vault wiki/entities/company_*.md + family_*.md + mc_markets.md
 * 由 vault-ingest API upsert 来。
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const VAULT_REPO_URL = 'https://github.com/lungtszyiu-creator/lty-vault/blob/main';

export default async function CompaniesPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN' && !session.user.financeRole) {
    redirect('/dashboard');
  }

  const all = await prisma.vaultCompanyMirror.findMany({
    orderBy: [{ status: 'asc' }, { jurisdiction: 'asc' }, { title: 'asc' }],
  });

  const active = all.filter((c) => c.status === 'ACTIVE');
  const privateOnes = all.filter((c) => c.status === 'PRIVATE_MATTER');
  const closed = all.filter((c) => c.status === 'CLOSED');

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Vault 公司实体</h1>
          <p className="mt-1 text-sm text-slate-500">
            从知识库 wiki/entities/company_*.md + family_*.md 镜像 · 共 {all.length} 实体
          </p>
        </div>
        <Link href="/finance" className="text-sm text-sky-700 hover:underline">
          ← 返回 finance
        </Link>
      </header>

      {all.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          暂无 vault 公司数据。
          <br />
          回 /finance 主页点 <strong>"📥 从 Vault 导入主数据"</strong> 触发 sync。
        </div>
      ) : (
        <>
          <Section title="✅ 在用业务实体" items={active} />
          <Section title="🔒 私人事务（不归公司业务图谱）" items={privateOnes} />
          <Section title="❌ 已关闭" items={closed} />
        </>
      )}
    </div>
  );
}

function Section({
  title,
  items,
}: {
  title: string;
  items: Array<{
    id: string;
    vaultPath: string;
    title: string;
    officialNameEn: string | null;
    officialNameZh: string | null;
    jurisdiction: string | null;
    legalRepresentative: string | null;
    actualController: string | null;
    registeredCapital: string | null;
    creditCode: string | null;
    established: string | null;
    relationToLty: string | null;
    privateMatter: boolean;
    status: string;
  }>;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
        {title}（{items.length}）
      </h2>
      <ul className="space-y-2">
        {items.map((c) => (
          <li
            key={c.id}
            className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300"
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-slate-900">{c.title}</h3>
                {(c.officialNameEn || c.officialNameZh) && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {c.officialNameEn}
                    {c.officialNameEn && c.officialNameZh ? ' · ' : ''}
                    {c.officialNameZh}
                  </p>
                )}
              </div>
              <Link
                href={`${VAULT_REPO_URL}/${c.vaultPath}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
              >
                ✓ vault
              </Link>
            </div>
            <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
              {c.jurisdiction && <Row label="司法管辖" value={c.jurisdiction} />}
              {c.legalRepresentative && <Row label="法人代表" value={c.legalRepresentative} />}
              {c.actualController && <Row label="实控人" value={c.actualController} />}
              {c.registeredCapital && <Row label="注册资本/编号" value={c.registeredCapital} />}
              {c.creditCode && <Row label="信用代码/BR" value={c.creditCode} />}
              {c.established && <Row label="成立" value={c.established} />}
              {c.relationToLty && <Row label="与 LTY 关系" value={c.relationToLty} span />}
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ label, value, span }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={span ? 'sm:col-span-2' : ''}>
      <dt className="inline text-slate-500">{label}：</dt>
      <dd className="inline text-slate-700">{value}</dd>
    </div>
  );
}
