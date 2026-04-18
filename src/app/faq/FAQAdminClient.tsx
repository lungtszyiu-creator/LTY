'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FAQ_CATEGORY_META, type FAQCategory } from '@/lib/constants';

type F = {
  id: string;
  category: string;
  question: string;
  answer: string;
  order: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

const EMPTY = { category: 'TASK_POOL' as FAQCategory, question: '', answer: '', order: 0 };

export default function FAQAdminClient({ initial }: { initial: F[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<F[]>(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<typeof EMPTY>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function startNew() { setEditing('__new__'); setDraft(EMPTY); setErr(null); }
  function startEdit(f: F) {
    setEditing(f.id);
    setDraft({ category: (f.category as FAQCategory) ?? 'TASK_POOL', question: f.question, answer: f.answer, order: f.order });
    setErr(null);
  }

  async function save() {
    if (!draft.question.trim()) { setErr('请输入问题'); return; }
    if (!draft.answer.trim()) { setErr('请填写答案'); return; }
    setBusy(true); setErr(null);
    try {
      const body = { category: draft.category, question: draft.question.trim(), answer: draft.answer.trim(), order: Number(draft.order) || 0 };
      if (editing === '__new__') {
        const res = await fetch('/api/faq', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error('保存失败');
        const f = await res.json();
        setItems((p) => [...p, f]);
      } else if (editing) {
        const res = await fetch(`/api/faq/${editing}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error('保存失败');
        const f = await res.json();
        setItems((p) => p.map((it) => (it.id === f.id ? f : it)));
      }
      setEditing(null);
      router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm('确认删除这条 Q&A？')) return;
    const res = await fetch(`/api/faq/${id}`, { method: 'DELETE' });
    if (!res.ok) { alert('删除失败'); return; }
    setItems((p) => p.filter((x) => x.id !== id));
    router.refresh();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-primary text-xs">编辑 Q&A</button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl rise-scale">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold">Q&A 管理</h3>
                <p className="text-xs text-slate-500">常见问题持续累积 · 减少同一问题被重复问</p>
              </div>
              <button onClick={() => setOpen(false)} className="btn btn-ghost text-xs">关闭</button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs text-slate-500">共 {items.length} 条问题</span>
                <button onClick={startNew} className="btn btn-gold text-xs">+ 新增问题</button>
              </div>

              <ul className="space-y-2">
                {items.map((f) => (
                  <li key={f.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                          {FAQ_CATEGORY_META[(f.category as FAQCategory) ?? 'OTHER'].label}
                        </span>
                        <span className="truncate font-medium">{f.question}</span>
                      </div>
                      <p className="line-clamp-1 text-xs text-slate-500">{f.answer}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs">
                      <button onClick={() => startEdit(f)} className="text-amber-700 hover:underline">编辑</button>
                      <button onClick={() => remove(f.id)} className="text-rose-600 hover:underline">删除</button>
                    </div>
                  </li>
                ))}
                {items.length === 0 && <li className="text-sm text-slate-500">还没有 Q&A。</li>}
              </ul>

              {editing && (
                <div className="mt-6 space-y-4 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                  <h4 className="text-sm font-semibold">{editing === '__new__' ? '新增问题' : '编辑问题'}</h4>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">分类</label>
                      <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as FAQCategory })} className="select">
                        {(Object.keys(FAQ_CATEGORY_META) as FAQCategory[]).map((k) => (
                          <option key={k} value={k}>{FAQ_CATEGORY_META[k].label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate-700">排序</label>
                      <input type="number" value={draft.order} onChange={(e) => setDraft({ ...draft, order: Number(e.target.value) })} className="input" />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">问题 *</label>
                    <input value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} className="input" />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">答案 *</label>
                    <textarea value={draft.answer} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} rows={6} className="textarea" placeholder="可换行分段。引用手册条款时写明 § 编号更有说服力。" />
                  </div>

                  {err && <p className="text-xs text-rose-600">{err}</p>}

                  <div className="flex justify-end gap-2">
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
