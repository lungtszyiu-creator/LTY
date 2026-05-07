'use client';

/**
 * 看板上传组件 —— 老板手机点 [📤 上传] 选文件 → Vercel Blob 直传 → DB 记录
 *
 * 设计：
 * - 客户端直传到 Vercel Blob CDN，绕过 Vercel 函数 4.5MB body 限制
 * - 上传成功后路由 onUploadCompleted webhook 写 PendingUpload 记录
 * - Mac 端 BlobSync 线程拉走文件 → blob 自动删除
 *
 * 上传时让用户手填一段说明（"这是什么文件 / 给知识管家的提示"），
 * 写到 PendingUpload.description。老板和知识库管家都能看，方便后续整理（老板要求）。
 *
 * 状态机：
 *   idle → picking → uploading (with progress) → done | error
 */
import { upload } from '@vercel/blob/client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type UploadState =
  | { kind: 'idle' }
  | { kind: 'picked'; file: File }
  | { kind: 'uploading'; filename: string; progressPct: number }
  | { kind: 'done'; filename: string }
  | { kind: 'error'; message: string };

const MAX_BYTES = 200 * 1024 * 1024;

export default function UploadButton() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<UploadState>({ kind: 'idle' });
  const [description, setDescription] = useState('');
  const router = useRouter();

  function pickFile(file: File) {
    if (file.size > MAX_BYTES) {
      setState({
        kind: 'error',
        message: `文件超过 200 MB 上限（实际 ${(file.size / 1024 / 1024).toFixed(1)} MB）`,
      });
      return;
    }
    setState({ kind: 'picked', file });
  }

  async function startUpload() {
    if (state.kind !== 'picked') return;
    const file = state.file;
    const trimmedDesc = description.trim();

    setState({ kind: 'uploading', filename: file.name, progressPct: 0 });

    try {
      // 上传路径：knowledge-uploads/<时间戳>-<文件名>，避免冲突
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const safeName = file.name.replace(/[^\w\u4e00-\u9fff.\-]/g, '_');
      const pathname = `knowledge-uploads/${ts}-${safeName}`;

      await upload(pathname, file, {
        access: 'public',
        handleUploadUrl: '/api/knowledge/upload',
        clientPayload: JSON.stringify({
          originalFilename: file.name,
          description: trimmedDesc || undefined,
        }),
        onUploadProgress: ({ percentage }) => {
          setState({ kind: 'uploading', filename: file.name, progressPct: Math.round(percentage) });
        },
      });

      setState({ kind: 'done', filename: file.name });
      setDescription('');
      // 刷新页面让 server component 重读 recent 列表
      router.refresh();
      // 3 秒后回到 idle，方便连续上传
      setTimeout(() => setState({ kind: 'idle' }), 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '未知错误';
      setState({ kind: 'error', message: msg });
    }
  }

  function cancel() {
    setState({ kind: 'idle' });
    setDescription('');
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pickFile(f);
          e.target.value = ''; // 允许同名再选
        }}
      />

      {(state.kind === 'idle' || state.kind === 'error') && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700"
        >
          📤 上传文件到 vault
        </button>
      )}

      {state.kind === 'picked' && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/40 px-3 py-2.5">
          <div className="mb-2 flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate font-medium text-violet-900">📎 {state.file.name}</span>
            <span className="shrink-0 text-violet-600 tabular-nums">
              {(state.file.size / 1024 / 1024).toFixed(1)} MB
            </span>
          </div>
          <label className="block">
            <span className="text-[11px] font-medium text-slate-700">
              文件说明 <span className="text-slate-400">（这是什么文件？给知识管家整理用）</span>
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 1000))}
              rows={3}
              placeholder="例：2026 Q1 财务月报 PDF / 客户 ABC 合同扫描件 / 法务部 SOP 修订版…"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-violet-500 focus:outline-none focus:ring focus:ring-violet-200"
            />
            <span className="mt-0.5 block text-right text-[10px] text-slate-400 tabular-nums">
              {description.length}/1000
            </span>
          </label>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={startUpload}
              className="flex-1 rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-violet-700"
            >
              开始上传
            </button>
            <button
              type="button"
              onClick={cancel}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            >
              取消
            </button>
          </div>
        </div>
      )}

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
