import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { APPROVAL_CATEGORY_META } from '@/lib/approvalFlow';
import NewApprovalClient from './NewApprovalClient';

export const dynamic = 'force-dynamic';

export default async function NewApprovalPage({
  searchParams,
}: {
  searchParams: { template?: string };
}) {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const templates = await prisma.approvalTemplate.findMany({
    where: { active: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  if (templates.length === 0) {
    return (
      <div className="pt-8">
        <div className="card py-14 text-center text-sm text-slate-500">
          <div className="mb-2 text-4xl">📋</div>
          <p>还没有可用的审批模板。</p>
          <Link href="/admin/approvals/templates" className="mt-3 inline-block text-indigo-600 hover:underline">
            去后台创建 →
          </Link>
        </div>
      </div>
    );
  }

  const selected = templates.find((t) => t.id === searchParams.template) ?? null;

  // Group by category
  const grouped = templates.reduce<Record<string, typeof templates>>((acc, t) => {
    (acc[t.category] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="pt-6 sm:pt-8">
      <div className="mb-5 rise sm:mb-6">
        <Link href="/approvals" className="mb-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">← 返回审批中心</Link>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">发起审批</h1>
        <p className="mt-1 text-sm text-slate-500">选一个模板，填写后提交。流程按模板预设运行。</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="card h-fit overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            可用模板
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {Object.entries(grouped).map(([cat, tpls]) => {
              const meta = APPROVAL_CATEGORY_META[cat] ?? APPROVAL_CATEGORY_META.OTHER;
              return (
                <li key={cat}>
                  <div className="bg-slate-50/70 px-4 py-1.5 text-[10px] uppercase tracking-widest text-slate-500">
                    {meta.icon} {meta.label}
                  </div>
                  <ul>
                    {tpls.map((t) => (
                      <li key={t.id}>
                        <Link
                          href={`/approvals/new?template=${t.id}`}
                          className={`flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm transition hover:bg-slate-50 ${selected?.id === t.id ? 'bg-amber-50 font-medium text-amber-900' : ''}`}
                        >
                          <span className="text-lg">{t.icon ?? meta.icon}</span>
                          <span className="flex-1 truncate">{t.name}</span>
                          {selected?.id === t.id && <span className="text-xs">▶</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </aside>

        <div>
          {!selected ? (
            <div className="card py-14 text-center text-sm text-slate-500">
              ← 请先在左侧选一个模板
            </div>
          ) : (
            <NewApprovalClient
              template={{
                id: selected.id,
                name: selected.name,
                icon: selected.icon,
                category: selected.category,
                description: selected.description,
                flowJson: selected.flowJson,
                fieldsJson: selected.fieldsJson,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
