'use client';

import { useCallback, useRef, useState } from 'react';

export type UploadedFile = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
};

export default function FileUpload({
  onChange,
  accept,
  label = '拖拽文件到此处，或点击选择',
}: {
  onChange: (files: UploadedFile[]) => void;
  accept?: string;
  label?: string;
}) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (picked: File[]) => {
    if (picked.length === 0) return;
    setErr(null); setUploading(true);
    try {
      const fd = new FormData();
      picked.forEach((f) => fd.append('file', f));
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Prefer the human-readable `message` server returns; fall back to
        // the code, then the bare status. Users saw silent fails before.
        throw new Error(body.message || body.error || `上传失败 (HTTP ${res.status})`);
      }
      const uploaded: UploadedFile[] = await res.json();
      setFiles((prev) => {
        const next = [...prev, ...uploaded];
        onChange(next);
        return next;
      });
    } catch (e: any) { setErr(e.message); } finally { setUploading(false); }
  }, [onChange]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    upload(Array.from(e.target.files ?? []));
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    upload(Array.from(e.dataTransfer.files));
  }

  function remove(id: string) {
    setFiles((prev) => {
      const next = prev.filter((f) => f.id !== id);
      onChange(next);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${
          dragOver
            ? 'border-slate-900 bg-slate-900/5'
            : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50'
        }`}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
          {uploading ? (
            <svg className="h-5 w-5 animate-spin text-slate-600" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
              <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
            </svg>
          ) : (
            <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M7 16a4 4 0 01-.88-7.903A5 5 0 0115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
          )}
        </div>
        <div className="text-sm font-medium text-slate-700">{uploading ? '上传中…' : label}</div>
        <div className="text-xs text-slate-500">支持多文件 · 单个最大 25 MB</div>
        <input ref={inputRef} type="file" multiple accept={accept} onChange={onPick} className="hidden" />
      </div>

      {err && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          ⚠️ {err}
        </div>
      )}

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100">
                <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate">{f.filename}</div>
                <div className="text-xs text-slate-500">{(f.size / 1024).toFixed(1)} KB</div>
              </div>
              <button type="button" onClick={() => remove(f.id)} className="text-xs text-slate-400 hover:text-rose-600">
                移除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
