'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { POSITION_LEVEL_META, type PositionLevel } from '@/lib/constants';

type P = {
  id: string;
  title: string;
  level: string;
  department: string | null;
  coreResponsibilities: string;
  kpis: string;
  notInTaskPool: string | null;
  order: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

const EMPTY = {
  title: '', level: 'STAFF' as PositionLevel, department: '',
  coreResponsibilities: '', kpis: '', notInTaskPool: '', order: 0,
};

export default function PositionsAdminClient({ initialPositions }: { initialPositions: P[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<P[]>(initialPositions);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<typeof EMPTY>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function startNew() {
    setEditing('__new__');
    setDraft(EMPTY);
    setErr(null);
  }

  function startEdit(p: P) {
    setEditing(p.id);
    setDraft({
      title: p.title, level: (p.level as PositionLevel) ?? 'STAFF',
      department: p.department ?? '',
      coreResponsibilities: p.coreResponsibilities, kpis: p.kpis,
      notInTaskPool: p.notInTaskPool ?? '', order: p.order,
    });
    setErr(null);
  }

  async function save() {
    if (!draft.title.trim()) { setErr('请输入岗位名称'); return; }
    if (!draft.coreResponsibilities.trim()) { setErr('请填写本职职责'); return; }
    if (!draft.kpis.trim()) { setErr('请填写考核重点'); return; }
    setBusy(true); setErr(null);
    try {
      const body = {
        title: draft.title.trim(),
        level: draft.level,
        department: draft.department.trim() || null,
        coreResponsibilities: draft.coreResponsibilities.trim(),
        kpis: draft.kpis.trim(),
        notInTaskPool: draft.notInTaskPool.trim() || null,
        order: Number(draft.order) || 0,
      };
      if (editing === '__new__') {
        const res = await fetch('/api/positions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error((await res.json()).error || '保存失败');
        const p = await res.json();
        setItems((prev) => [...prev, p]);
      } else if (editing) {
        const res = await fetch(`/api/positions/${editing}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error((await res.json()).error || '保存失败');
        const p = await res.json();
        setItems((prev) => prev.map((it) => (it.id === p.id ? p : it)));
      }
      setEditing(null);
      router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm('确认删除该岗位？')) return;
    const res = await fetch(`/api/positions/${id}`, { method: 'DELETE' });
    if (!res.ok) { alert('删除失败'); return; }
    setItems((prev) => prev.filter((p) => p.id !== id));
    router.refresh();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-primary text-xs">编辑岗位</button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl rise-scale">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold">岗位管理</h3>
                <p className="text-xs text-slate-500">编辑各岗位的本职职责 · 让所有人知道任务池的"份外"边界</p>
              </div>
              <button onClick={() => setOpen(false)} className="btn btn-ghost text-xs">关闭</button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs text-slate-500">共 {items.length} 个岗位</span>
                <button onClick={startNew} className="btn btn-gold text-xs">+ 新增岗位</button>
              </div>

              {/* List */}
              <ul className="space-y-2">
                {items.map((p) => {
                  const lvl = POSITION_LEVEL_META[p.level as PositionLevel] ?? POSITION_LEVEL_META.STAFF;
                  return (
                    <li key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${lvl.bg} ${lvl.text} ${lvl.ring}`}>{lvl.label}</span>
                        <span className="font-medium">{p.title}</span>
                        {p.department && <span className="text-xs text-slate-500">· {p.department}</span>}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <button onClick={() => startEdit(p)} className="text-amber-700 hover:underline">编辑</button>
                        <button onClick={() => remove(p.id)} className="text-rose-600 hover:underline">删除</button>
                      </div>
                    </li>
                  );
                })}
                {items.length === 0 && <li className="text-sm text-slate-500">还没有岗位，点右上角"+ 新增岗位"开始。</li>}
              </ul>

              {/* Editor */}
              {editing && (
                <div className="mt-6 space-y-4 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                  <h4 className="text-sm font-semibold">{editing === '__new__' ? '新增岗位' : '编辑岗位'}</h4>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate-700">岗位名称 *</label>
                      <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="input" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">层级</label>
                      <select value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value as PositionLevel })} className="select">
                        <option value="EXECUTIVE">高层决策</option>
                        <option value="MANAGER">中高层管理</option>
                        <option value="STAFF">职员</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">部门（可选）</label>
                    <input value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} className="input" placeholder="如：市场部 / 产品部 / 财务部" />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">本职职责（Lane A · 必填）*</label>
                    <textarea value={draft.coreResponsibilities} onChange={(e) => setDraft({ ...draft, coreResponsibilities: e.target.value })} rows={5} className="textarea" placeholder="列出岗位说明书里的日常职责，换行分项即可。" />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">考核重点（KPI / OKR）*</label>
                    <textarea value={draft.kpis} onChange={(e) => setDraft({ ...draft, kpis: e.target.value })} rows={3} className="textarea" placeholder="如：用户增长数、客户满意度、项目里程碑达成率…" />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">不进入任务池的事项（可选）</label>
                    <textarea value={draft.notInTaskPool} onChange={(e) => setDraft({ ...draft, notInTaskPool: e.target.value })} rows={3} className="textarea" placeholder="写清楚哪些看起来像任务、但实际属于本职的事项，避免以后塞进任务池产生争议。" />
                  </div>

                  {err && <p className="text-xs text-rose-600">{err}</p>}

                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setEditing(null)} className="btn btn-ghost text-xs">取消</button>
                    <button onClick={save} disabled={busy} className="btn btn-primary text-xs disabled:opacity-50">
                      {busy ? '保存中…' : '保存'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
