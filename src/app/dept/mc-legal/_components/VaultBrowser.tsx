'use client';

/**
 * MC 法务 vault 文件浏览器（client component）
 *
 * 通过 /api/dept/mc-legal/vault-tree 拉 mc-legal-vault repo 目录树，
 * 用户点目录展开 / 点文件跳 GitHub。
 *
 * 设计：
 * - 初次加载根目录
 * - 每个目录按需懒加载（点击展开时才拉子目录）
 * - 已加载的目录缓存在 state，关闭再开不重拉
 * - 文件点击在新标签打开 GitHub html_url（PDF 直接预览，markdown 渲染过的）
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

export function VaultBrowser() {
  const [rootEntries, setRootEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDir('').then((entries) => {
      if (entries === null) return;
      setRootEntries(entries);
    }).finally(() => setLoading(false));
  }, []);

  async function loadDir(path: string): Promise<Entry[] | null> {
    try {
      const url = `/api/dept/mc-legal/vault-tree${path ? `?path=${encodeURIComponent(path)}` : ''}`;
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
        <div className="font-medium">读取 mc-legal-vault 失败</div>
        <div className="mt-1 font-mono text-xs">{error}</div>
        <div className="mt-3 text-xs text-slate-600">
          检查 Vercel 是否配了{' '}
          <code className="rounded bg-white px-1 ring-1 ring-rose-200">MC_VAULT_GITHUB_TOKEN</code>
          ，且对 mc-legal-vault repo 有 Contents Read 权限。
        </div>
      </div>
    );
  }

  if (!rootEntries) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2 text-xs text-slate-500">
        <span>📁 mc-legal-vault（仅老板可见）</span>
        <a
          href="https://github.com/lungtszyiu-creator/mc-legal-vault"
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
              <li className="px-2 py-0.5 text-xs text-slate-400" style={{ paddingLeft: `${(depth + 1) * 16 + 4}px` }}>
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
