'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Attachment = { id: string; filename: string; mimeType: string; size: number; createdAt: string };
type Department = { id: string; name: string };
type UserOpt = { id: string; name: string | null; email: string; image: string | null };
type FolderSummary = {
  id: string; name: string; visibility: string; parentId: string | null;
  department: { id: string; name: string } | null;
  createdBy: { id: string; name: string | null; email: string };
  createdAt: string; updatedAt: string;
  _count: { files: number; children: number };
};

type CurrentFolder = {
  id: string; name: string; visibility: string; parentId: string | null; departmentId: string | null;
  createdAt: string; updatedAt: string;
  department: { id: string; name: string } | null;
  createdBy: { id: string; name: string | null; email: string };
  members: { id: string; userId: string; access: string; user: { id: string; name: string | null; email: string } }[];
};

type Access = {
  canView: boolean;
  canEdit: boolean;
  effectiveVisibility: string;
  effectiveFolderId: string | null;
  reason: string;
};

const VIS_LABEL: Record<string, string> = {
  INHERIT: '继承父级',
  PUBLIC: '🌐 公开',
  DEPARTMENT: '🏢 部门',
  PRIVATE: '🔒 私密',
};

export default function FilesClient({
  currentFolderId,
  currentFolder,
  access,
  breadcrumbs,
  children,
  files,
  departments,
  users,
}: {
  currentFolderId: string | null;
  currentFolder: CurrentFolder | null;
  access: Access;
  breadcrumbs: { id: string; name: string }[];
  children: FolderSummary[];
  files: Attachment[];
  departments: Department[];
  users: UserOpt[];
}) {
  const router = useRouter();
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // New folder state
  const [newName, setNewName] = useState('');
  const [newVis, setNewVis] = useState<'INHERIT' | 'PUBLIC' | 'DEPARTMENT' | 'PRIVATE'>('INHERIT');
  const [newDept, setNewDept] = useState('');
  const [newMembers, setNewMembers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Settings state (permissions)
  const [editVis, setEditVis] = useState(currentFolder?.visibility ?? 'INHERIT');
  const [editDept, setEditDept] = useState(currentFolder?.departmentId ?? '');
  const [editMembers, setEditMembers] = useState<string[]>(
    currentFolder?.members?.map((m) => m.userId) ?? []
  );

  async function createFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          parentId: currentFolderId,
          visibility: newVis,
          departmentId: newVis === 'DEPARTMENT' ? newDept || null : null,
          memberIds: newVis === 'PRIVATE' ? newMembers : [],
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '创建失败');
      setCreatingFolder(false);
      setNewName(''); setNewVis('INHERIT'); setNewDept(''); setNewMembers([]);
      router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function savePermissions() {
    if (!currentFolderId) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/folders/${currentFolderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibility: editVis,
          departmentId: editVis === 'DEPARTMENT' ? (editDept || null) : null,
          memberIds: editVis === 'PRIVATE' ? editMembers : [],
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '保存失败');
      setSettingsOpen(false);
      router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const form = new FormData();
    for (const f of Array.from(fileList)) form.append('file', f);
    setBusy(true); setErr(null);
    try {
      const url = currentFolderId ? `/api/upload?folderId=${currentFolderId}` : '/api/upload';
      const res = await fetch(url, { method: 'POST', body: form });
      if (!res.ok) throw new Error((await res.json()).error ?? '上传失败');
      router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function deleteFolder() {
    if (!currentFolderId) return;
    if (!confirm(`确定删除文件夹"${currentFolder?.name}"？子文件夹、文件会一并删除。`)) return;
    const res = await fetch(`/api/folders/${currentFolderId}`, { method: 'DELETE' });
    if (!res.ok) { alert('删除失败'); return; }
    if (currentFolder?.parentId) router.push(`/files?folder=${currentFolder.parentId}`);
    else router.push('/files');
  }

  async function deleteFile(fileId: string, filename: string) {
    if (!confirm(`确定删除文件"${filename}"？此操作不可撤销。`)) return;
    const res = await fetch(`/api/attachments/${fileId}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.message ?? body.error ?? '删除失败');
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumbs */}
      <div className="flex flex-wrap items-center gap-1 text-sm text-slate-600">
        <Link href="/files" className="hover:text-slate-900">📁 根目录</Link>
        {breadcrumbs.map((b, i) => (
          <span key={b.id} className="flex items-center gap-1">
            <span className="text-slate-400">/</span>
            {i === breadcrumbs.length - 1 ? (
              <span className="font-medium text-slate-900">{b.name}</span>
            ) : (
              <Link href={`/files?folder=${b.id}`} className="hover:text-slate-900">{b.name}</Link>
            )}
          </span>
        ))}
      </div>

      {/* Current folder info bar */}
      {currentFolder && (
        <div className="card p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-base font-semibold">{currentFolder.name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                <span>{VIS_LABEL[access.effectiveVisibility] ?? access.effectiveVisibility}</span>
                {currentFolder.department && <span>· {currentFolder.department.name}</span>}
                <span>· 创建人 {currentFolder.createdBy.name ?? currentFolder.createdBy.email}</span>
                {access.reason === 'inherit-to-root-public' && <span className="text-slate-400">· 继承自上层</span>}
              </div>
            </div>
            {access.canEdit && (
              <div className="flex gap-2">
                <button onClick={() => setSettingsOpen((v) => !v)} className="btn btn-ghost text-xs">
                  {settingsOpen ? '收起' : '权限设置'}
                </button>
                <button onClick={deleteFolder} className="text-xs text-rose-600">删除</button>
              </div>
            )}
          </div>

          {settingsOpen && access.canEdit && (
            <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">访问权限</label>
                <select value={editVis} onChange={(e) => setEditVis(e.target.value as any)} className="select">
                  <option value="INHERIT">继承父级（默认）</option>
                  <option value="PUBLIC">🌐 公开（全公司）</option>
                  <option value="DEPARTMENT">🏢 仅指定部门</option>
                  <option value="PRIVATE">🔒 仅指定成员</option>
                </select>
              </div>
              {editVis === 'DEPARTMENT' && (
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">部门</label>
                  <select value={editDept} onChange={(e) => setEditDept(e.target.value)} className="select">
                    <option value="">—— 选择部门 ——</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}
              {editVis === 'PRIVATE' && (
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">可访问成员</label>
                  <MemberPicker users={users} selected={editMembers} onChange={setEditMembers} />
                </div>
              )}
              <div className="flex justify-end">
                <button onClick={savePermissions} disabled={busy} className="btn btn-primary">保存权限</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Permission helper: at root, show a banner explaining the model */}
      {!currentFolder && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
          🔐 <strong>权限怎么用</strong>：建文件夹时选 <strong>🏢 仅指定部门</strong> → 只有该部门成员可见；选 <strong>🔒 仅指定成员</strong> → 只有你勾的人可见。子文件夹默认<strong>继承父级权限</strong>，一次设好整棵树都听话。先去 <a href="/admin/departments" className="underline">/admin/departments</a> 把部门和成员建好。
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-slate-500">
          {children.length} 个文件夹 · {files.length} 个文件
        </div>
        {access.canEdit && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setCreatingFolder((v) => !v)} className="btn btn-ghost">
              {creatingFolder ? '取消' : '+ 新建文件夹'}
            </button>
            <label className="btn btn-primary cursor-pointer">
              <input
                type="file"
                multiple
                hidden
                onChange={(e) => uploadFiles(e.target.files)}
              />
              上传文件
            </label>
          </div>
        )}
      </div>

      {err && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}

      {/* New folder form */}
      {creatingFolder && (
        <form onSubmit={createFolder} className="card space-y-3 p-4 ring-1 ring-amber-200 sm:p-5">
          <div className="text-sm font-semibold">新建文件夹</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">名称 *</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} required maxLength={200} className="input" placeholder="例：2026 品牌资产" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">权限</label>
              <select value={newVis} onChange={(e) => setNewVis(e.target.value as any)} className="select">
                <option value="INHERIT">继承父级</option>
                <option value="PUBLIC">🌐 公开（全公司）</option>
                <option value="DEPARTMENT">🏢 仅指定部门</option>
                <option value="PRIVATE">🔒 仅指定成员</option>
              </select>
            </div>
            {newVis === 'DEPARTMENT' && (
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">部门</label>
                <select value={newDept} onChange={(e) => setNewDept(e.target.value)} className="select">
                  <option value="">—— 选择部门 ——</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            )}
            {newVis === 'PRIVATE' && (
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">可访问成员</label>
                <MemberPicker users={users} selected={newMembers} onChange={setNewMembers} />
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={busy} className="btn btn-primary">{busy ? '创建中…' : '创建'}</button>
          </div>
        </form>
      )}

      {/* Child folders */}
      {children.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {children.map((c) => (
            <li key={c.id}>
              <Link href={`/files?folder=${c.id}`} className="card lift block p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">📁</span>
                    <span className="font-medium line-clamp-1">{c.name}</span>
                  </div>
                  <span className="shrink-0 text-[10px] text-slate-500">{VIS_LABEL[c.visibility]}</span>
                </div>
                <div className="text-xs text-slate-500">
                  {c._count.children} 子文件夹 · {c._count.files} 文件
                </div>
                {c.department && <div className="mt-0.5 text-xs text-slate-400">{c.department.name}</div>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Files */}
      {files.length > 0 && (
        <ul className="card divide-y divide-slate-100 overflow-hidden">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-4 py-3 text-sm transition hover:bg-slate-50">
              <span className="text-xl shrink-0">{pickEmoji(f.mimeType, f.filename)}</span>
              <a href={`/api/attachments/${f.id}`} target="_blank" className="min-w-0 flex-1">
                <div className="truncate">{f.filename}</div>
                <div className="text-xs text-slate-500">{(f.size / 1024).toFixed(1)} KB · {new Date(f.createdAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}</div>
              </a>
              <a href={`/api/attachments/${f.id}`} target="_blank" className="shrink-0 text-xs text-indigo-600">下载</a>
              {access.canEdit && (
                <button
                  onClick={() => deleteFile(f.id, f.filename)}
                  className="shrink-0 text-xs text-rose-600 hover:underline"
                  title="删除该文件"
                >
                  删除
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {children.length === 0 && files.length === 0 && (
        <div className="card py-14 text-center text-sm text-slate-500">
          这里还没有内容。{access.canEdit ? '点上面的按钮上传文件或建文件夹。' : '等有权限的同事上传内容。'}
        </div>
      )}
    </div>
  );
}

function MemberPicker({
  users,
  selected,
  onChange,
}: {
  users: UserOpt[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  return (
    <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
      <ul className="space-y-0.5">
        {users.map((u) => (
          <li key={u.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-slate-50">
              <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} />
              <span>{u.name ?? u.email}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function pickEmoji(mime: string, name: string) {
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime.includes('pdf')) return '📕';
  if (mime.includes('spreadsheet') || name.match(/\.(xlsx?|csv)$/i)) return '📊';
  if (mime.includes('word') || name.match(/\.docx?$/i)) return '📄';
  if (mime.includes('zip') || name.match(/\.(zip|rar|7z)$/i)) return '🗜️';
  return '📎';
}
