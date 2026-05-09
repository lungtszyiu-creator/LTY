'use client';

/**
 * 看板上传组件 —— 老板手机点 [📤 上传] 选文件 → Vercel Blob 直传 → DB 记录
 *
 * 支持两种入口（2026-05-09）：
 *  1. 📤 单文件 — 选一个文件，单次上传
 *  2. 📁 整个文件夹 — Mac/PC 上选目录（webkitdirectory），一次性串行上传
 *     文件夹里所有文件，子目录也保留。每个文件 PendingUpload.filename
 *     存 webkitRelativePath（例 `MC法务部/03_合同管理/章程.pdf`），Mac
 *     sync 端能据此重建结构（不行的话也能扁平落 _inbox）。
 *
 * 设计：
 * - 客户端直传到 Vercel Blob CDN，绕过 Vercel 函数 4.5MB body 限制
 * - 上传成功后路由 onUploadCompleted webhook 写 PendingUpload 记录
 * - Mac 端 BlobSync 线程拉走文件 → blob 自动删除
 *
 * 文件夹模式 = 一个 description 共享给整批文件；总进度条 = 完成数/总数；
 * 失败的文件累计在 failed 列表，不打断后续上传（每个文件独立 try/catch）。
 *
 * 状态机：
 *   idle → picked / folder-picked → uploading / folder-uploading → done / folder-done | error
 */
import { upload } from '@vercel/blob/client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type UploadState =
  | { kind: 'idle' }
  | { kind: 'picked'; file: File }
  | { kind: 'folder-picked'; files: File[]; rootName: string }
  | { kind: 'uploading'; filename: string; progressPct: number }
  | {
      kind: 'folder-uploading';
      total: number;
      doneCount: number;
      currentFilename: string;
      currentPct: number;
      failed: { name: string; reason: string }[];
    }
  | { kind: 'done'; filename: string }
  | { kind: 'folder-done'; total: number; failed: { name: string; reason: string }[] }
  | { kind: 'error'; message: string };

const MAX_BYTES = 200 * 1024 * 1024;
// 文件夹模式总大小硬上限（防止误传整个 ~/Desktop ~50GB）
const FOLDER_MAX_FILES = 500;
const FOLDER_MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB 总量

export default function UploadButton({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<UploadState>({ kind: 'idle' });
  const [description, setDescription] = useState('');
  // 目标 vault：仅 SUPER_ADMIN 看到 mc-legal-vault 选项；非老板永远 lty-vault
  const [targetVault, setTargetVault] = useState<'lty-vault' | 'mc-legal-vault'>('lty-vault');
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

  /**
   * 文件夹挑选处理：webkitdirectory 让 input 一次给所有子文件，
   * webkitRelativePath 保留相对路径（如 "合同管理/01/章程.pdf"）。
   * 过滤掉系统 .DS_Store 之类垃圾，超大文件也一次性预警。
   */
  function pickFolder(fileList: FileList) {
    const all = Array.from(fileList);
    // 过滤系统垃圾文件（macOS .DS_Store / Thumbs.db 之类）
    const files = all.filter((f) => {
      const base = (f.webkitRelativePath || f.name).split('/').pop() ?? '';
      if (base.startsWith('.')) return false;
      if (base === 'Thumbs.db' || base === 'desktop.ini') return false;
      return true;
    });

    if (files.length === 0) {
      setState({ kind: 'error', message: '文件夹是空的（或全是系统隐藏文件）' });
      return;
    }
    if (files.length > FOLDER_MAX_FILES) {
      setState({
        kind: 'error',
        message: `文件数 ${files.length} 超过 ${FOLDER_MAX_FILES} 上限。请分批或先压缩。`,
      });
      return;
    }
    const total = files.reduce((s, f) => s + f.size, 0);
    if (total > FOLDER_MAX_TOTAL_BYTES) {
      setState({
        kind: 'error',
        message: `文件夹总大小 ${(total / 1024 / 1024 / 1024).toFixed(2)} GB 超过 2 GB 上限`,
      });
      return;
    }
    const oversize = files.find((f) => f.size > MAX_BYTES);
    if (oversize) {
      setState({
        kind: 'error',
        message: `文件夹内有单文件超过 200 MB：${oversize.name}（${(oversize.size / 1024 / 1024).toFixed(1)} MB）`,
      });
      return;
    }

    // 取根目录名给 UI 显示（"合同管理"）
    const rootName =
      files[0]?.webkitRelativePath?.split('/')?.[0] ?? '（无目录名）';
    setState({ kind: 'folder-picked', files, rootName });
  }

  async function startUpload() {
    if (state.kind !== 'picked') return;
    const file = state.file;
    const trimmedDesc = description.trim();

    setState({ kind: 'uploading', filename: file.name, progressPct: 0 });

    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const safeName = file.name.replace(/[^\w一-鿿.\-]/g, '_');
      const pathname = `knowledge-uploads/${ts}-${safeName}`;

      await upload(pathname, file, {
        access: 'public',
        handleUploadUrl: '/api/knowledge/upload',
        clientPayload: JSON.stringify({
          originalFilename: file.name,
          description: trimmedDesc || undefined,
          targetVault: targetVault === 'mc-legal-vault' ? 'mc-legal-vault' : undefined,
        }),
        onUploadProgress: ({ percentage }) => {
          setState({ kind: 'uploading', filename: file.name, progressPct: Math.round(percentage) });
        },
      });

      setState({ kind: 'done', filename: file.name });
      setDescription('');
      router.refresh();
      setTimeout(() => setState({ kind: 'idle' }), 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '未知错误';
      setState({ kind: 'error', message: msg });
    }
  }

  /**
   * 文件夹串行上传 —— 一个一个传，每个文件失败累计到 failed 不阻塞后续。
   * 用 webkitRelativePath 作 originalFilename 让 Mac sync 端能保留目录结构。
   */
  async function startFolderUpload() {
    if (state.kind !== 'folder-picked') return;
    const files = state.files;
    const trimmedDesc = description.trim();
    const failed: { name: string; reason: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relPath = file.webkitRelativePath || file.name;

      setState({
        kind: 'folder-uploading',
        total: files.length,
        doneCount: i,
        currentFilename: relPath,
        currentPct: 0,
        failed: [...failed],
      });

      try {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        // pathname 里也保留目录结构（去掉 ASCII 之外的字符 + 替换非法字符）
        const safePath = relPath.replace(/[^\w一-鿿./\-]/g, '_');
        const pathname = `knowledge-uploads/${ts}-${safePath}`;

        await upload(pathname, file, {
          access: 'public',
          handleUploadUrl: '/api/knowledge/upload',
          clientPayload: JSON.stringify({
            // ✅ 这里给完整相对路径，Mac sync 端拿这个重建子目录
            originalFilename: relPath,
            description: trimmedDesc || undefined,
            targetVault: targetVault === 'mc-legal-vault' ? 'mc-legal-vault' : undefined,
          }),
          onUploadProgress: ({ percentage }) => {
            setState((prev) => {
              if (prev.kind !== 'folder-uploading') return prev;
              return {
                ...prev,
                currentPct: Math.round(percentage),
              };
            });
          },
        });
      } catch (e: unknown) {
        const reason = e instanceof Error ? e.message : '未知错误';
        failed.push({ name: relPath, reason });
      }
    }

    setState({ kind: 'folder-done', total: files.length, failed });
    setDescription('');
    router.refresh();
    // 文件夹模式停在结果页，老板手动关 — 失败列表要给他看
  }

  function cancel() {
    setState({ kind: 'idle' });
    setDescription('');
  }

  const totalSizeMb =
    state.kind === 'folder-picked'
      ? state.files.reduce((s, f) => s + f.size, 0) / 1024 / 1024
      : 0;

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pickFile(f);
          e.target.value = '';
        }}
      />

      {/* 文件夹选择 input —— webkitdirectory 让浏览器弹文件夹选择器。
          React TS 不识别这个 attribute，用扩展对象方式塞进去。 */}
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ webkitdirectory: '', directory: '' } as any)}
        onChange={(e) => {
          const fl = e.target.files;
          if (fl && fl.length > 0) pickFolder(fl);
          e.target.value = '';
        }}
      />

      {(state.kind === 'idle' || state.kind === 'error') && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700"
          >
            📤 上传文件
          </button>
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600/90 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700"
          >
            📁 整个文件夹
          </button>
        </div>
      )}

      {state.kind === 'picked' && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/40 px-3 py-2.5">
          <div className="mb-2 flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate font-medium text-violet-900">📎 {state.file.name}</span>
            <span className="shrink-0 text-violet-600 tabular-nums">
              {(state.file.size / 1024 / 1024).toFixed(1)} MB
            </span>
          </div>
          <VaultSelector
            isSuperAdmin={isSuperAdmin}
            targetVault={targetVault}
            setTargetVault={setTargetVault}
          />
          <DescriptionField description={description} setDescription={setDescription} />
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

      {state.kind === 'folder-picked' && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/40 px-3 py-2.5">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-xs">
            <span className="truncate font-medium text-violet-900">
              📁 {state.rootName}
            </span>
            <span className="shrink-0 tabular-nums text-violet-600">
              {state.files.length} 个文件 · {totalSizeMb.toFixed(1)} MB
            </span>
          </div>
          {/* 列前 5 个文件给老板预览，超过就省略 */}
          <ul className="mb-2 max-h-28 overflow-y-auto rounded border border-violet-200 bg-white px-2 py-1 text-[10px] text-slate-600">
            {state.files.slice(0, 8).map((f) => (
              <li key={f.webkitRelativePath || f.name} className="truncate font-mono">
                {f.webkitRelativePath || f.name}
              </li>
            ))}
            {state.files.length > 8 && (
              <li className="text-slate-400">… 共 {state.files.length} 个</li>
            )}
          </ul>
          <VaultSelector
            isSuperAdmin={isSuperAdmin}
            targetVault={targetVault}
            setTargetVault={setTargetVault}
          />
          <DescriptionField
            description={description}
            setDescription={setDescription}
            hint="整批文件共用一段说明（「这是什么文件夹」），知识管家整理时会看见"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={startFolderUpload}
              className="flex-1 rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-violet-700"
            >
              开始上传 {state.files.length} 个文件
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

      {state.kind === 'folder-uploading' && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/50 px-3 py-2.5 text-xs text-violet-900">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <span className="font-medium">
              整体进度 {state.doneCount} / {state.total}
              {state.failed.length > 0 && (
                <span className="ml-1 text-rose-700">· 失败 {state.failed.length}</span>
              )}
            </span>
            <span className="ml-2 tabular-nums">
              {Math.round((state.doneCount / state.total) * 100)}%
            </span>
          </div>
          <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-violet-200/60">
            <div
              className="h-full bg-violet-600 transition-[width] duration-150"
              style={{ width: `${(state.doneCount / state.total) * 100}%` }}
            />
          </div>
          <div className="mb-1 truncate text-[11px] text-slate-600">
            正在传 · <span className="font-mono">{state.currentFilename}</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-violet-200/40">
            <div
              className="h-full bg-violet-400 transition-[width] duration-150"
              style={{ width: `${state.currentPct}%` }}
            />
          </div>
        </div>
      )}

      {state.kind === 'done' && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-900">
          ✅ <span className="font-medium">{state.filename}</span> 已上传，等 Mac 端拉走（约 30 秒内）
        </div>
      )}

      {state.kind === 'folder-done' && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 text-xs text-emerald-900">
          <div className="font-medium">
            ✅ 文件夹上传完成 · 成功 {state.total - state.failed.length} / {state.total}
          </div>
          {state.failed.length > 0 && (
            <details className="mt-1.5">
              <summary className="cursor-pointer text-rose-800">
                ⚠️ {state.failed.length} 个失败 — 展开看
              </summary>
              <ul className="mt-1 max-h-32 overflow-y-auto rounded bg-white px-2 py-1 text-[10px] text-rose-800">
                {state.failed.map((f) => (
                  <li key={f.name} className="truncate">
                    <span className="font-mono">{f.name}</span> — {f.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <button
            type="button"
            onClick={() => setState({ kind: 'idle' })}
            className="mt-2 rounded bg-emerald-700 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-800"
          >
            关闭
          </button>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2 text-xs text-rose-900">
          ❌ {state.message}
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        ≤ 200 MB / 文件 · 文件夹 ≤ 500 个 / 2 GB · 落{' '}
        <code className="rounded bg-slate-100 px-1">~/LTY旭珑/raw/_inbox/from_dashboard/</code>
      </p>
    </div>
  );
}

/**
 * 目标 vault 选择器（仅 SUPER_ADMIN 可见）
 *
 * 默认 lty-vault；SUPER_ADMIN 可切换 mc-legal-vault 上传到隔离仓库。
 * 非老板角色不显示这个 UI（始终 lty-vault），避免误传 MC 客户机密数据。
 */
function VaultSelector({
  isSuperAdmin,
  targetVault,
  setTargetVault,
}: {
  isSuperAdmin: boolean;
  targetVault: 'lty-vault' | 'mc-legal-vault';
  setTargetVault: (v: 'lty-vault' | 'mc-legal-vault') => void;
}) {
  if (!isSuperAdmin) return null;
  return (
    <div className="mb-2 rounded-lg border border-amber-200/60 bg-amber-50/60 px-2.5 py-1.5">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-amber-700">
        目标 vault（仅老板可选）
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setTargetVault('lty-vault')}
          className={`flex-1 rounded px-2 py-1 text-xs font-medium transition ${
            targetVault === 'lty-vault'
              ? 'bg-violet-600 text-white'
              : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
          }`}
        >
          🏢 LTY 业务
        </button>
        <button
          type="button"
          onClick={() => setTargetVault('mc-legal-vault')}
          className={`flex-1 rounded px-2 py-1 text-xs font-medium transition ${
            targetVault === 'mc-legal-vault'
              ? 'bg-rose-600 text-white'
              : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
          }`}
        >
          🔒 MC 法务
        </button>
      </div>
      {targetVault === 'mc-legal-vault' && (
        <div className="mt-1 text-[10px] text-rose-700">
          ⚠️ 上传到 MC 法务隔离仓库（mc-legal-vault repo），不进 LTY vault
        </div>
      )}
    </div>
  );
}

function DescriptionField({
  description,
  setDescription,
  hint,
}: {
  description: string;
  setDescription: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-slate-700">
        文件说明{' '}
        <span className="text-slate-400">
          （{hint ?? '这是什么文件？给知识管家整理用'}）
        </span>
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
  );
}
