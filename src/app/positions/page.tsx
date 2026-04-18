import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { POSITION_LEVEL_META, type PositionLevel } from '@/lib/constants';
import PositionsAdminClient from './PositionsAdminClient';

export const dynamic = 'force-dynamic';

export default async function PositionsPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  const isAdmin = session.user.role === 'ADMIN';

  const positions = await prisma.position.findMany({
    where: { active: true },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });

  // group by level
  const grouped: Record<string, typeof positions> = { EXECUTIVE: [], MANAGER: [], STAFF: [] };
  positions.forEach((p) => { (grouped[p.level] ?? grouped.STAFF).push(p); });

  const levelOrder: PositionLevel[] = ['EXECUTIVE', 'MANAGER', 'STAFF'];

  return (
    <div className="pt-8">
      <div className="mb-6 flex items-end justify-between gap-4 rise">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">岗位与本职</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            每个岗位的"本职范围"在这里一次说清楚 · 本职之外的工作才进任务池。
            本页内容出自手册 <span className="font-mono text-xs text-slate-400">§ 2.3 / § 2.5 / § 7.1</span>。
          </p>
        </div>
        {isAdmin && (
          <PositionsAdminClient
            initialPositions={positions.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() }))}
          />
        )}
      </div>

      {positions.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-20 text-center rise rise-delay-1">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
            <svg className="h-7 w-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
          </div>
          <p className="text-sm text-slate-500">还没有设置岗位。管理员点右上角"编辑岗位"添加。</p>
        </div>
      ) : (
        <div className="space-y-8">
          {levelOrder.map((lvl) => {
            const rows = grouped[lvl];
            if (!rows || rows.length === 0) return null;
            const meta = POSITION_LEVEL_META[lvl];
            return (
              <section key={lvl} className="rise rise-delay-1">
                <div className="mb-3 flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ${meta.bg} ${meta.text} ${meta.ring}`}>
                    {meta.label}
                  </span>
                  <span className="text-xs text-slate-400">{rows.length} 个岗位</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {rows.map((p) => (
                    <article key={p.id} className="card relative overflow-hidden p-5">
                      <div className="accent-bar absolute inset-x-0 top-0 h-0.5 opacity-50" />
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-base font-semibold tracking-tight">{p.title}</h3>
                          {p.department && <p className="text-xs text-slate-500">{p.department}</p>}
                        </div>
                      </div>
                      <Section label="本职职责（Lane A）">{p.coreResponsibilities}</Section>
                      <Section label="考核重点">{p.kpis}</Section>
                      {p.notInTaskPool && (
                        <div className="mt-3 rounded-lg bg-amber-50/70 p-3 ring-1 ring-amber-200/70">
                          <div className="mb-1 text-[10px] font-medium uppercase tracking-widest text-amber-800">不进入任务池的事项</div>
                          <p className="whitespace-pre-wrap text-xs text-amber-900">{p.notInTaskPool}</p>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <div className="mt-10 rise rise-delay-2">
        <div className="card bg-slate-50/70 p-5">
          <h3 className="mb-2 text-sm font-semibold">本职 vs 任务池 · 快速判断</h3>
          <div className="grid gap-3 text-xs text-slate-600 sm:grid-cols-2">
            <div>
              <div className="mb-1 font-medium text-slate-700">✅ 本职（不进任务池）</div>
              <ul className="list-disc space-y-0.5 pl-5">
                <li>岗位说明书里写过的常规职责</li>
                <li>日报 / 周报 / 月报（手册 § 5.1-5.3）</li>
                <li>部门周会分配过的工作</li>
                <li>你的 KPI / OKR 本就涵盖的指标</li>
              </ul>
            </div>
            <div>
              <div className="mb-1 font-medium text-slate-700">⭐ 额外贡献（进任务池）</div>
              <ul className="list-disc space-y-0.5 pl-5">
                <li>跨部门协作（不属于任何单一岗位）</li>
                <li>流程改进 / 知识沉淀 / SOP 编写</li>
                <li>救火应急 / 对外代表公司</li>
                <li>带来新客户 / 新营收且不在 KPI 内</li>
              </ul>
            </div>
          </div>
          <p className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500">
            还分不清？<Link href="/faq" className="text-amber-700 underline-offset-2 hover:underline">去 Q&A 看看</Link>或直接问你的直属上级。
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-widest text-slate-500">{label}</div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{children}</p>
    </div>
  );
}
