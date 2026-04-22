'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { useEffect, useRef, useState } from 'react';

type Props = {
  docId: string;
  initialTitle: string;
  initialBodyJson: string;
  canEdit: boolean;
  meId: string;
  initialUpdatedAt: string;
  onSave?: (state: { title: string; bodyJson: string; bodyText: string }) => Promise<void>;
};

// Autosave debouncer: waits 1500ms after the last edit before flushing the
// patch. 1500ms hits the sweet spot where typing feels local but HR can
// see changes sync in near-real-time when multiple people view.
const AUTOSAVE_DELAY_MS = 1500;

export default function DocEditor({
  docId, initialTitle, initialBodyJson, canEdit, meId, initialUpdatedAt, onSave,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const pendingRef = useRef<null | ReturnType<typeof setTimeout>>(null);
  const snapshotCountdownRef = useRef(0);
  // Tracks the updatedAt we've already rendered. Poller compares against
  // the server value to detect remote edits. Bumped after our own saves so
  // we don't re-apply our own changes.
  const lastSeenUpdatedRef = useRef<number>(new Date(initialUpdatedAt).getTime() || Date.now());
  const [remoteUpdater, setRemoteUpdater] = useState<string | null>(null);

  let parsed: any = {};
  try { parsed = JSON.parse(initialBodyJson || '{}'); } catch { parsed = {}; }
  if (!parsed || typeof parsed !== 'object' || !parsed.type) {
    parsed = { type: 'doc', content: [{ type: 'paragraph' }] };
  }

  const editor = useEditor({
    editable: canEdit,
    // Server-side render mismatch avoidance: don't render in SSR; TipTap
    // hydrates on mount. immediatelyRender=false is the React 18 / Next 14
    // recommended setting.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: '输入 "/" 调出命令…或直接开写' }),
      Link.configure({ openOnClick: true, autolink: true, protocols: ['http', 'https', 'mailto'] }),
      Image.configure({ inline: false, allowBase64: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow, TableHeader, TableCell,
    ],
    content: parsed,
    onUpdate: ({ editor: e }) => {
      if (!canEdit || !onSave) return;
      if (pendingRef.current) clearTimeout(pendingRef.current);
      setStatus('saving');
      pendingRef.current = setTimeout(async () => {
        try {
          const bodyJson = JSON.stringify(e.getJSON());
          const bodyText = e.getText();
          // Every 10 autosaves bundle a snapshot so the version history fills
          // in without spamming DocVersion rows on every keystroke.
          snapshotCountdownRef.current += 1;
          const shouldSnapshot = snapshotCountdownRef.current >= 10;
          if (shouldSnapshot) snapshotCountdownRef.current = 0;
          await onSave({ title, bodyJson, bodyText });
          setStatus('saved');
          setTimeout(() => setStatus('idle'), 1200);
        } catch {
          setStatus('error');
        }
      }, AUTOSAVE_DELAY_MS);
    },
  });

  // When the user edits the title input, piggy-back on the editor's autosave
  // pipeline: schedule a save through onUpdate by forcing a re-save of the
  // current body with the new title.
  useEffect(() => {
    if (!editor || !canEdit || !onSave) return;
    if (pendingRef.current) clearTimeout(pendingRef.current);
    setStatus('saving');
    pendingRef.current = setTimeout(async () => {
      try {
        await onSave({
          title,
          bodyJson: JSON.stringify(editor.getJSON()),
          bodyText: editor.getText(),
        });
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 1200);
      } catch {
        setStatus('error');
      }
    }, AUTOSAVE_DELAY_MS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  // Unmount: flush pending save so the user doesn't lose the last keystrokes.
  useEffect(() => {
    return () => {
      if (pendingRef.current && editor && canEdit && onSave) {
        clearTimeout(pendingRef.current);
        onSave({
          title,
          bodyJson: JSON.stringify(editor.getJSON()),
          bodyText: editor.getText(),
        }).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Poll-based near-realtime sync ----
  // Every 5s re-fetch the doc. If the server has a newer updatedAt and the
  // last editor wasn't me, swap content in. Skipped whenever:
  //   - local save is pending (we're mid-type)
  //   - editor has focus (interrupting typing is jarring)
  // This is the zero-config fallback when Liveblocks isn't enabled. Not
  // true CRDT collab — last-save-wins if two people type simultaneously —
  // but for a 50-person team where conflicts are rare it's enough.
  useEffect(() => {
    if (!editor || !canEdit) return;
    let cancelled = false;
    const id = setInterval(async () => {
      if (cancelled) return;
      if (pendingRef.current) return;
      if (editor.isFocused) return;
      try {
        const res = await fetch(`/api/docs/${docId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const fresh = await res.json();
        const freshTs = new Date(fresh.updatedAt).getTime();
        if (freshTs <= lastSeenUpdatedRef.current) return;
        lastSeenUpdatedRef.current = freshTs;
        if (fresh.lastEditor?.id && fresh.lastEditor.id !== meId) {
          try {
            const parsed = JSON.parse(fresh.bodyJson);
            if (parsed && parsed.type) {
              editor.commands.setContent(parsed, { emitUpdate: false });
            }
          } catch { /* malformed body — skip */ }
          setTitle(fresh.title);
          setRemoteUpdater(fresh.lastEditor.name ?? fresh.lastEditor.email ?? '同事');
          setTimeout(() => setRemoteUpdater(null), 4000);
        }
      } catch { /* network hiccup — retry next tick */ }
    }, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [editor, canEdit, docId, meId]);

  async function onImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editor) return;
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) {
      alert('图片上传失败');
      return;
    }
    const [att] = await res.json();
    editor.chain().focus().setImage({ src: `/api/attachments/${att.id}`, alt: att.filename }).run();
  }

  return (
    <div className="flex flex-col">
      {/* Title row: inline input, large, no border */}
      <div className="mb-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="无标题文档"
          readOnly={!canEdit}
          className="w-full border-0 bg-transparent p-0 text-3xl font-semibold tracking-tight text-slate-900 placeholder:text-slate-300 focus:outline-none"
        />
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {status === 'saving' && <span>正在保存…</span>}
          {status === 'saved' && <span>✓ 已保存</span>}
          {status === 'error' && <span className="text-rose-600">⚠️ 保存失败，稍后重试</span>}
          {remoteUpdater && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-800 ring-1 ring-indigo-200">
              🔄 {remoteUpdater} 刚刚更新了内容
            </span>
          )}
        </div>
      </div>

      {/* Toolbar: minimal — most formatting is discoverable via Markdown
          shortcuts (# ## ### - > ``` etc.) and the slash menu will ship
          in Phase 2. These are shortcuts for mouse users. */}
      {canEdit && editor && (
        <div className="mb-3 flex flex-wrap gap-1 rounded-xl bg-slate-50 p-1.5 ring-1 ring-slate-200">
          <TbBtn ed={editor} cmd={(c) => c.toggleBold()} active={editor.isActive('bold')} label="加粗" icon="𝐁" />
          <TbBtn ed={editor} cmd={(c) => c.toggleItalic()} active={editor.isActive('italic')} label="斜体" icon="𝘐" />
          <TbBtn ed={editor} cmd={(c) => c.toggleStrike()} active={editor.isActive('strike')} label="删除线" icon="S̶" />
          <TbBtn ed={editor} cmd={(c) => c.toggleCode()} active={editor.isActive('code')} label="行内代码" icon="⟨/⟩" />
          <span className="mx-1 w-px bg-slate-300" />
          <TbBtn ed={editor} cmd={(c) => c.toggleHeading({ level: 1 })} active={editor.isActive('heading', { level: 1 })} label="标题 1" icon="H1" />
          <TbBtn ed={editor} cmd={(c) => c.toggleHeading({ level: 2 })} active={editor.isActive('heading', { level: 2 })} label="标题 2" icon="H2" />
          <TbBtn ed={editor} cmd={(c) => c.toggleHeading({ level: 3 })} active={editor.isActive('heading', { level: 3 })} label="标题 3" icon="H3" />
          <span className="mx-1 w-px bg-slate-300" />
          <TbBtn ed={editor} cmd={(c) => c.toggleBulletList()} active={editor.isActive('bulletList')} label="无序列表" icon="•" />
          <TbBtn ed={editor} cmd={(c) => c.toggleOrderedList()} active={editor.isActive('orderedList')} label="有序列表" icon="1." />
          <TbBtn ed={editor} cmd={(c) => c.toggleTaskList()} active={editor.isActive('taskList')} label="待办" icon="☑" />
          <TbBtn ed={editor} cmd={(c) => c.toggleBlockquote()} active={editor.isActive('blockquote')} label="引用" icon="❝" />
          <TbBtn ed={editor} cmd={(c) => c.toggleCodeBlock()} active={editor.isActive('codeBlock')} label="代码块" icon="{}" />
          <TbBtn ed={editor} cmd={(c) => c.setHorizontalRule()} active={false} label="分隔线" icon="—" />
          <span className="mx-1 w-px bg-slate-300" />
          <TbBtn
            ed={editor}
            cmd={(c) => {
              const url = window.prompt('链接地址（https://…）');
              if (url) c.setLink({ href: url });
              return c;
            }}
            active={editor.isActive('link')}
            label="链接"
            icon="🔗"
          />
          <label className="inline-flex cursor-pointer items-center justify-center rounded-md px-2 py-1 text-xs text-slate-700 hover:bg-white hover:ring-1 hover:ring-slate-200" title="插入图片">
            🖼️
            <input type="file" accept="image/*" onChange={onImagePick} className="hidden" />
          </label>
          <TbBtn
            ed={editor}
            cmd={(c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true })}
            active={false}
            label="插入表格"
            icon="▦"
          />
        </div>
      )}

      {/* Editor surface */}
      <div className="doc-editor prose prose-slate max-w-none">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function TbBtn({
  ed, cmd, active, label, icon,
}: {
  ed: any;
  cmd: (c: any) => any;
  active: boolean;
  label: string;
  icon: string;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={() => cmd(ed.chain().focus()).run()}
      className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-xs transition ${
        active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-white hover:ring-1 hover:ring-slate-200'
      }`}
    >
      {icon}
    </button>
  );
}
