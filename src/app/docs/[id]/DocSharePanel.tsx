'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import BottomSheet from '@/components/BottomSheet';

type DeptOpt = { id: string; name: string };
type UserOpt = { id: string; name: string | null; email: string };
type Member  = { userId: string; access: 'VIEW' | 'EDIT' };

type Props = {
  docId: string;
  canManage: boolean; // creator or SUPER_ADMIN
  initialVisibility: 'PUBLIC' | 'DEPARTMENT' | 'PRIVATE';
  initialDepartmentId: string | null;
  initialMembers: { userId: string; access: string; user: UserOpt }[];
  departments: DeptOpt[];
  users: UserOpt[];
};

// Share/permissions modal. The trigger button lives inline; when tapped it
// opens a bottom sheet with a visibility radio, department picker (when
// DEPARTMENT), and member picker with VIEW/EDIT toggle (when PRIVATE).
export default function DocSharePanel({
  docId, canManage, initialVisibility, initialDepartmentId, initialMembers,
  departments, users,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState(initialVisibility);
  const [departmentId, setDepartmentId] = useState(initialDepartmentId ?? '');
  const [members, setMembers] = useState<Member[]>(
    initialMembers.map((m) => ({ userId: m.userId, access: m.access as 'VIEW' | 'EDIT' }))
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleMember(userId: string) {
    setMembers((prev) => {
      const has = prev.find((m) => m.userId === userId);
      return has ? prev.filter((m) => m.userId !== userId) : [...prev, { userId, access: 'VIEW' }];
    });
  }
  function setAccess(userId: string, access: 'VIEW' | 'EDIT') {
    setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, access } : m)));
  }

  async function save() {
    if (visibility === 'DEPARTMENT' && !departmentId) {
      setErr('请选择一个部门'); return;
    }
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/docs/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibility,
          departmentId: visibility === 'DEPARTMENT' ? departmentId : null,
          memberIds: visibility === 'PRIVATE' ? members : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? '保存失败');
      }
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const visibilityLabel = visibility === 'PUBLIC' ? '🌐 公开' : visibility === 'DEPARTMENT' ? '🏢 部门' : '🔒 私密';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        {visibilityLabel} · 共享设置
      </button>

      <BottomSheet open={open} title="文档共享" onClose={() => setOpen(false)}>
        <div className="space-y-4 p-5">
          {!canManage && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              🔒 只有文档创建人和总管理者可以修改共享设置。你在只读查看。
            </div>
          )}

          {/* Visibility radio cards */}
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">访问权限</div>
            <div className="space-y-2">
              {(['PUBLIC', 'DEPARTMENT', 'PRIVATE'] as const).map((v) => {
                const meta = {
                  PUBLIC:     { icon: '🌐', name: '公开',     desc: '全公司成员都能查看 / 编辑' },
                  DEPARTMENT: { icon: '🏢', name: '仅指定部门', desc: '只有该部门成员可见，可编辑' },
                  PRIVATE:    { icon: '🔒', name: '仅指定成员', desc: '手动邀请，按人给 只读 / 可编辑 权限' },
                }[v];
                const on = visibility === v;
                return (
                  <button
                    key={v}
                    type="button"
                    disabled={!canManage}
                    onClick={() => setVisibility(v)}
                    className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      on ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <span className="text-xl">{meta.icon}</span>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-900">{meta.name}</div>
                      <div className="text-xs text-slate-500">{meta.desc}</div>
                    </div>
                    {on && (
                      <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {visibility === 'DEPARTMENT' && (
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">选择部门</div>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                disabled={!canManage}
                className="select"
              >
                <option value="">—— 请选择 ——</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}

          {visibility === 'PRIVATE' && (
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">可访问成员（{members.length}）</div>
              <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1">
                {users.map((u) => {
                  const m = members.find((x) => x.userId === u.id);
                  const on = !!m;
                  return (
                    <div key={u.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!canManage}
                        onChange={() => toggleMember(u.id)}
                        className="h-4 w-4"
                      />
                      <span className="flex-1 truncate text-sm">{u.name ?? u.email}</span>
                      {on && canManage && (
                        <select
                          value={m?.access ?? 'VIEW'}
                          onChange={(e) => setAccess(u.id, e.target.value as any)}
                          className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs"
                        >
                          <option value="VIEW">只读</option>
                          <option value="EDIT">可编辑</option>
                        </select>
                      )}
                      {on && !canManage && (
                        <span className="text-xs text-slate-500">{m?.access === 'EDIT' ? '可编辑' : '只读'}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {err && <p className="text-sm text-rose-600">⚠️ {err}</p>}

          {canManage && (
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button onClick={() => setOpen(false)} className="btn btn-ghost">取消</button>
              <button onClick={save} disabled={busy} className="btn btn-primary">{busy ? '保存中…' : '保存共享设置'}</button>
            </div>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
