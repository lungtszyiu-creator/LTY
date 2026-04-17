'use client';

import { useState } from 'react';

export type UploadedFile = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
};

export default function FileUpload({
  onChange,
}: {
  onChange: (files: UploadedFile[]) => void;
}) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    setErr(null);
    setUploading(true);
    try {
      const fd = new FormData();
      picked.forEach((f) => fd.append('file', f));
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `上传失败 (${res.status})`);
      }
      const uploaded: UploadedFile[] = await res.json();
      const next = [...files, ...uploaded];
      setFiles(next);
      onChange(next);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function remove(id: string) {
    const next = files.filter((f) => f.id !== id);
    setFiles(next);
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <input
        type="file"
        multiple
        onChange={handlePick}
        disabled={uploading}
        className="block text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-slate-700 hover:file:bg-slate-200"
      />
      {uploading && <p className="text-xs text-slate-500">上传中…</p>}
      {err && <p className="text-xs text-rose-600">{err}</p>}
      {files.length > 0 && (
        <ul className="space-y-1 text-sm">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1">
              <span className="truncate">{f.filename} <span className="text-xs text-slate-500">({(f.size / 1024).toFixed(1)} KB)</span></span>
              <button type="button" onClick={() => remove(f.id)} className="text-xs text-rose-600 hover:underline">
                移除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
