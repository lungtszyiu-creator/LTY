'use client';

/**
 * 看板上传组件 —— 老板手机点 [📤 上传] 选文件 → Vercel Blob 直传 → DB 记录
 *
 * 设计：
 * - 客户端直传到 Vercel Blob CDN，绕过 Vercel 函数 4.5MB body 限制
 * - 上传成功后路由 onUploadCompleted webhook 写 PendingUpload 记录
 * - Mac 端 BlobSync 线程拉走文件 → blob 自动删除
 *
 * 状态机：
 *   idle → picking → uploading (with progress) → done | error
 */
import { upload } from '@vercel/blob/client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type UploadState =
  | { kind: 'idle' }
  | { kind: 'uploading'; filename: string; progressPct: number }
  | { kind: 'done'; filename: string }
  | { kind: 'error'; message: string };

const MAX_BYTES = 200 * 1024 * 1024;

export default function UploadButton() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<UploadState>({ kind: 'idle' });
  const router = useRouter();

  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      setState({ kind: 'error', message: `文件超过 200 MB 上限（实际 ${(file.size / 1024 / 1024).toFixed(1)} MB）` });
      return;
    }

    setState({ kind: 'uploading', filename: file.name, progressPct: 0 });

    try {
      // 上传路径：knowledge-uploads/<时间戳>-<文件名>，避免冲突
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const safeName = file.name.replace(/[^\w\u4e00-\u9fff.\-]/g, '_');
      const pathname = `knowledge-uploads/${ts}-${safeName}`;

      await upload(pathname, file, {
        access: 'public',
        handleUploadUrl: '/api/knowledge/upload',
        clientPayload: JSON.stringify({ originalFilename: file.name }),
        onUploadProgress: ({ percentage }) => {
          setState({ kind: 'uploading', filename: file.name, progressPct: Math.round(percentage) });
        },
      });

      setState({ kind: 'done', filename: file.name });
      // 刷新页面让 server component 重读 recent 列表
      router.refresh();
      // 3 秒后回到 idle，方便连续上传
      setTimeout(() => setState({ kind: 'idle' }), 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '未知错误';
      setState({ kind: 'error', message: msg });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = ''; // 允许同名再选
        }}
      />

      <button
        type="button"
        disabled={state.kind === 'uploading'}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-400"
      >
        📤 上传文件到 vault
      </button>

      {state.kind === 'uploading' && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/50 px-3 py-2 text-xs text-violet-900">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="truncate font-medium">{state.filename}</span>
            <span className="ml-2 tabular-nums">{state.progressPct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-violet-200/60">
            <div
              className="h-full bg-violet-600 transition-[width] duration-150"
              style={{ width: `${state.progressPct}%` }}
            />
          </div>
        </div>
      )}

      {state.kind === 'done' && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-900">
          ✅ <span className="font-medium">{state.filename}</span> 已上传，等 Mac 端拉走（约 30 秒内）
        </div>
      )}

      {state.kind === 'error' && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2 text-xs text-rose-900">
          ❌ {state.message}
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        ≤ 200 MB · 文件落 <code className="rounded bg-slate-100 px-1">~/LTY旭珑/raw/_inbox/from_dashboard/</code>
      </p>
    </div>
  );
}
