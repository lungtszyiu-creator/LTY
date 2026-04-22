'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';

type DocNode = {
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
  visibility: string;
};

// Build a nested tree from the flat docs[]. Parents that the user can't
// see are stripped server-side, so orphaned children are re-parented to
// the root — they still show up in the sidebar.
function buildTree<T extends DocNode>(docs: T[]): (T & { children: (T & any)[] })[] {
  const byId = new Map<string, T & { children: any[] }>();
  for (const d of docs) byId.set(d.id, { ...d, children: [] });
  const roots: (T & { children: any[] })[] = [];
  for (const d of byId.values()) {
    if (d.parentId && byId.has(d.parentId)) {
      byId.get(d.parentId)!.children.push(d);
    } else {
      roots.push(d);
    }
  }
  const sortRec = (arr: any[]) => {
    arr.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
    arr.forEach((x) => sortRec(x.children));
  };
  sortRec(roots);
  return roots;
}

export default function DocsTree({ docs }: { docs: DocNode[] }) {
  const tree = useMemo(() => buildTree(docs), [docs]);
  const pathname = usePathname();
  const activeId = pathname?.startsWith('/docs/') ? pathname.split('/')[2] : null;

  if (docs.length === 0) {
    return <div className="px-4 py-6 text-center text-xs text-slate-500">还没有任何文档</div>;
  }

  return (
    <ul className="py-1">
      {tree.map((n) => <TreeRow key={n.id} node={n} depth={0} activeId={activeId} />)}
    </ul>
  );
}

function TreeRow({ node, depth, activeId }: { node: any; depth: number; activeId: string | null }) {
  const hasChildren = node.children && node.children.length > 0;
  const [open, setOpen] = useState(depth < 1 || activeId === node.id);
  const isActive = activeId === node.id;

  return (
    <li>
      <div className={`flex items-center gap-1 px-2 py-1.5 text-sm transition hover:bg-slate-50 ${isActive ? 'bg-amber-50 text-amber-900' : 'text-slate-700'}`}
           style={{ paddingLeft: 8 + depth * 14 }}>
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}
        <Link href={`/docs/${node.id}`} className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
          <span className="text-sm">{node.icon ?? '📄'}</span>
          <span className="truncate">{node.title}</span>
        </Link>
      </div>
      {open && hasChildren && (
        <ul>
          {node.children.map((c: any) => <TreeRow key={c.id} node={c} depth={depth + 1} activeId={activeId} />)}
        </ul>
      )}
    </li>
  );
}
