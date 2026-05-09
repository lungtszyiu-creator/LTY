'use client';

/**
 * 通用 vault 文件浏览器（client component）
 *
 * 通用化版本：接受 apiPath（每个 vault 用各自 API endpoint，因 token 不同）
 * + initialPath（限定显示哪个子目录，部门只看自己那部分）。
 *
 * 设计：
 * - 初次加载 initialPath 目录
 * - 每个目录懒加载（点击展开才拉子目录）
 * - 已加载的缓存在 state，关闭再开不重拉
 * - 文件点击在新标签开 GitHub html_url（PDF 直接预览）
 *
 * 用法：
 *   // MC 法务（独立 vault）
 *   <VaultBrowser apiPath="/api/dept/mc-legal/vault-tree"
 *                 repoUrl="https://github.com/lungtszyiu-creator/mc-legal-vault" />
 *
 *   // LTY 部门子目录
 *   <VaultBrowser apiPath="/api/dept/vault-tree" initialPath="raw/财务部"
 *                 repoUrl="https://github.com/lungtszyiu-creator/lty-vault/tree/main/raw/财务部" />
 */
import { useEffect, useState } from 'react';

type Entry = {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  size: number;
  htmlUrl: string;
  downloadUrl: string | null;
};

export function VaultBrowser({
  apiPath,
  repoUrl,
  initialPath = '',
  emptyHint,
}: {
  apiPath: string;
  repoUrl: string;
  initialPath?: string;
  emptyHint?: string;
}) {
  const [rootEntries, setRootEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDir(initialPath).then((entries) => {
      if (entries === null) return;
      setRootEntries(entries);
    }).finally(() => setLoading(false));
  }, [apiPath, initialPath]);

  async function loadDir(path: string): Promise<Entry[] | null> {
    try {
      const url = path ? `${apiPath}?path=${encodeURIComponent(path)}` : apiPath;
      const resp = await fetch(url);
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.message || data.error || `HTTP ${resp.status}`);
        return null;
      }
      return data.entries;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-400">
        加载中…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-300/60 bg-rose-50/40 px-6 py-6 text-sm text-rose-900">
        <div className="font-medium">读取 vault 失败</div>
        <div className="mt-1 font-mono text-xs">{error}</div>
      </div>
    );
  }

  if (!rootEntries || rootEntries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/40 px-6 py-8 text-center text-sm text-slate-500">
        {emptyHint ?? '该目录为空'}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2 text-xs text-slate-500">
        <span>{initialPath ? `📁 ${initialPath}` : '📁 vault 根目录'}</span>
        <a
          href={repoUrl}
          target="_blank"
          rel="noreferrer"
          className="text-rose-700 hover:underline"
        >
          ↗ 直达 GitHub
        </a>
      </div>
      <ul className="space-y-0.5">
        {rootEntries.map((e) => (
          <TreeNode key={e.path} entry={e} loadDir={loadDir} depth={0} />
        ))}
      </ul>
    </div>
  );
}

function TreeNode({
  entry,
  loadDir,
  depth,
}: {
  entry: Entry;
  loadDir: (path: string) => Promise<Entry[] | null>;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<Entry[] | null>(null);
  const [loadingChildren, setLoadingChildren] = useState(false);

  async function toggle() {
    if (entry.type !== 'dir') return;
    if (!expanded && children === null) {
      setLoadingChildren(true);
      const c = await loadDir(entry.path);
      setChildren(c);
      setLoadingChildren(false);
    }
    setExpanded(!expanded);
  }

  const indent = { paddingLeft: `${depth * 16 + 4}px` };

  if (entry.type === 'dir') {
    return (
      <li>
        <button
          type="button"
          onClick={toggle}
          className="flex w-full items-baseline gap-1.5 rounded px-2 py-1 text-left text-sm hover:bg-slate-50"
          style={indent}
        >
          <span className="text-slate-400">{expanded ? '📂' : '📁'}</span>
          <span className="font-medium text-slate-800">{entry.name}</span>
          {loadingChildren && <span className="text-xs text-slate-400">…</span>}
        </button>
        {expanded && children && (
          <ul className="space-y-0.5">
            {children.length === 0 ? (
              <li
                className="px-2 py-0.5 text-xs text-slate-400"
                style={{ paddingLeft: `${(depth + 1) * 16 + 4}px` }}
              >
                （空文件夹）
              </li>
            ) : (
              children.map((c) => (
                <TreeNode key={c.path} entry={c} loadDir={loadDir} depth={depth + 1} />
              ))
            )}
          </ul>
        )}
      </li>
    );
  }

  // 文件
  const sizeKb = (entry.size / 1024).toFixed(1);
  return (
    <li>
      <a
        href={entry.htmlUrl}
        target="_blank"
        rel="noreferrer"
        className="flex items-baseline gap-1.5 rounded px-2 py-1 text-sm transition hover:bg-rose-50"
        style={indent}
      >
        <span className="text-slate-400">{fileIcon(entry.name)}</span>
        <span className="flex-1 truncate text-slate-700">{entry.name}</span>
        <span className="shrink-0 text-[10px] tabular-nums text-slate-400">{sizeKb} KB</span>
      </a>
    </li>
  );
}

function fileIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return '📄';
  if (lower.endsWith('.md')) return '📝';
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return '🖼';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return '📊';
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) return '📃';
  return '📎';
}
