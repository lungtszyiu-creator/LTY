'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import FileUpload, { type UploadedFile } from '@/components/FileUpload';

export default function NewTaskForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reward, setReward] = useState('');
  const [deadline, setDeadline] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const body: any = {
        title, description,
        reward: reward || null,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        attachmentIds: files.map((f) => f.id),
      };
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || '发布失败');
      const task = await res.json();
      router.push(`/tasks/${task.id}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border bg-white p-6">
      <Field label="标题" required>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required
          className="w-full rounded-lg border px-3 py-2 text-sm focus:border-slate-400 focus:outline-none" />
      </Field>
      <Field label="任务说明" required>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} required
          className="w-full rounded-lg border px-3 py-2 text-sm focus:border-slate-400 focus:outline-none" />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="奖励（可选）">
          <input value={reward} onChange={(e) => setReward(e.target.value)} placeholder="￥100 / 奶茶一杯 / 下周调休"
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-slate-400 focus:outline-none" />
        </Field>
        <Field label="截止时间（可选）">
          <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-slate-400 focus:outline-none" />
        </Field>
      </div>
      <Field label="附件（可选）">
        <FileUpload onChange={setFiles} />
      </Field>
      {err && <p className="text-sm text-rose-600">{err}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          {busy ? '发布中…' : '发布'}
        </button>
        <button type="button" onClick={() => router.back()}
          className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
          取消
        </button>
      </div>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}{required && <span className="ml-1 text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}
