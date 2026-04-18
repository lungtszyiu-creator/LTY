import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { FAQ_CATEGORY_META, type FAQCategory } from '@/lib/constants';
import FAQAdminClient from './FAQAdminClient';

export const dynamic = 'force-dynamic';

const CATEGORY_ORDER: FAQCategory[] = ['TASK_POOL', 'COMP', 'PROCESS', 'OTHER'];

export default async function FAQPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  const isAdmin = session.user.role === 'ADMIN';

  const items = await prisma.fAQ.findMany({
    where: { active: true },
    orderBy: [{ category: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
  });

  const grouped = CATEGORY_ORDER.reduce((acc, c) => ({ ...acc, [c]: [] as typeof items }), {} as Record<FAQCategory, typeof items>);
  items.forEach((it) => {
    const k = (CATEGORY_ORDER.includes(it.category as FAQCategory) ? it.category : 'OTHER') as FAQCategory;
    grouped[k].push(it);
  });

  return (
    <div className="pt-8">
      <div className="mb-6 flex items-end justify-between gap-4 rise">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">常见问题 · Q&A</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            关于任务池、薪酬、日常工作的规则疑问集中答复 · 内容与员工手册对应 · 问题持续补充中。
          </p>
        </div>
        {isAdmin && (
          <FAQAdminClient
            initial={items.map((it) => ({ ...it, createdAt: it.createdAt.toISOString(), updatedAt: it.updatedAt.toISOString() }))}
          />
        )}
      </div>

      {items.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-20 text-center rise rise-delay-1">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-2xl">❓</div>
          <p className="text-sm text-slate-500">还没有问题。管理员可以右上角「编辑 Q&A」补充。</p>
        </div>
      ) : (
        <div className="space-y-8">
          {CATEGORY_ORDER.map((c) => {
            const rows = grouped[c];
            if (!rows || rows.length === 0) return null;
            return (
              <section key={c} className="rise rise-delay-1">
                <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                  {FAQ_CATEGORY_META[c].label}
                </h2>
                <div className="space-y-2.5">
                  {rows.map((it, idx) => (
                    <details
                      key={it.id}
                      className="card group px-5 py-4"
                      open={idx === 0 && c === 'TASK_POOL'}
                    >
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
                        <span className="flex-1 text-[15px] font-medium text-slate-800">{it.question}</span>
                        <span className="mt-0.5 shrink-0 text-slate-400 transition group-open:rotate-180">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 9l-7 7-7-7" /></svg>
                        </span>
                      </summary>
                      <div className="mt-3 whitespace-pre-wrap border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-600">
                        {it.answer}
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
