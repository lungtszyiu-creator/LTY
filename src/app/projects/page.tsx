import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { hasMinRole, type Role } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: { board?: string };
}) {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const isAdmin = hasMinRole(session.user.role as Role, 'ADMIN');
  const boards = await prisma.projectBoard.findMany({
    where: { active: true },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });

  const selected = boards.find((b) => b.id === searchParams.board) ?? boards[0] ?? null;

  return (
    <div className="pt-6 sm:pt-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 rise sm:mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">📊 项目管理</h1>
          <p className="mt-1 text-sm text-slate-500">
            外部看板统一入口：Jira / Airtable / Notion / 多维表 都可以嵌入。
          </p>
        </div>
        {isAdmin && (
          <Link href="/admin/projects" className="btn btn-primary shrink-0">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
            配置看板
          </Link>
        )}
      </div>

      {boards.length === 0 ? (
        <div className="card py-14 text-center text-sm text-slate-500 rise rise-delay-1">
          <div className="mb-2 text-4xl">📋</div>
          <p>还没有配置项目看板。</p>
          {isAdmin && (
            <Link href="/admin/projects" className="mt-3 inline-block text-indigo-600 hover:underline">
              前往添加第一个看板 →
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2 rise rise-delay-1">
            {boards.map((b) => {
              const active = b.id === selected?.id;
              return (
                <Link
                  key={b.id}
                  href={`/projects?board=${b.id}`}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition ${
                    active ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {b.icon && <span>{b.icon}</span>}
                  {b.name}
                </Link>
              );
            })}
          </div>

          {selected && (
            <div className="rise rise-delay-2">
              {selected.description && (
                <p className="mb-3 text-sm text-slate-600">{selected.description}</p>
              )}
              <div className="card overflow-hidden">
                <iframe
                  src={selected.iframeUrl}
                  title={selected.name}
                  className="h-[75vh] w-full border-0"
                  // Some providers (Jira, Notion) need allow-same-origin & scripts
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                  allow="clipboard-read; clipboard-write"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <div className="mt-2 text-right text-xs text-slate-500">
                看板嵌入自：<a href={selected.iframeUrl} target="_blank" className="underline-offset-2 hover:underline">{new URL(selected.iframeUrl).hostname}</a>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
