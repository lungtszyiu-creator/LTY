import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { listVisibleDocIds } from '@/lib/docAccess';
import { fmtDateTime } from '@/lib/datetime';
import DocsTree from './DocsTree';
import CreateDocButton from './CreateDocButton';

export const dynamic = 'force-dynamic';

export default async function DocsIndexPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const visibleIds = await listVisibleDocIds({ id: session.user.id, role: session.user.role });
  const docs = await prisma.doc.findMany({
    where: { id: { in: Array.from(visibleIds) }, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, title: true, icon: true, parentId: true, visibility: true, updatedAt: true,
      lastEditor: { select: { id: true, name: true, email: true } },
    },
  });

  const serialized = docs.map((d) => ({
    ...d,
    updatedAt: d.updatedAt.toISOString(),
  }));

  const recent = serialized.slice(0, 10);

  return (
    <div className="pt-6 sm:pt-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 rise sm:mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">📄 云协作文档</h1>
          <p className="mt-1 text-sm text-slate-500">
            像 Lark / Notion 一样写 SOP、会议纪要、知识库。支持嵌套文件夹、自动保存、版本快照。
          </p>
        </div>
        <CreateDocButton />
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="card h-fit overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            所有文档（{docs.length}）
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            <DocsTree docs={serialized} />
          </div>
        </aside>

        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            最近编辑
          </div>
          {recent.length === 0 ? (
            <div className="py-14 text-center text-sm text-slate-500">
              还没有任何文档 — 点右上角"➕ 新建文档"开始
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.map((d) => (
                <li key={d.id}>
                  <Link href={`/docs/${d.id}`} className="flex items-center gap-3 px-4 py-3 text-sm transition hover:bg-slate-50">
                    <span className="text-xl">{d.icon ?? '📄'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-900">{d.title}</div>
                      <div className="truncate text-xs text-slate-500">
                        {d.lastEditor ? `最后编辑：${d.lastEditor.name ?? d.lastEditor.email} · ` : ''}{fmtDateTime(d.updatedAt)}
                      </div>
                    </div>
                    <VisibilityChip visibility={d.visibility} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function VisibilityChip({ visibility }: { visibility: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PUBLIC:     { label: '🌐 公开',   cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    DEPARTMENT: { label: '🏢 部门',   cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
    PRIVATE:    { label: '🔒 私密',   cls: 'bg-amber-50 text-amber-900 ring-amber-200' },
  };
  const m = map[visibility] ?? map.PUBLIC;
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] ring-1 ${m.cls}`}>
      {m.label}
    </span>
  );
}
