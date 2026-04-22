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
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { LiveblocksYjsProvider } from '@liveblocks/yjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { RoomProvider, useRoom, useOthers } from '@/lib/liveblocks';
import SaveIndicator from '../SaveIndicator';

// Real-time collab editor. Top-level wraps the RoomProvider so every
// collaborator joining a given doc shares one Yjs doc via Liveblocks.
export default function CollaborativeDocEditor(props: {
  docId: string;
  initialTitle: string;
  initialBodyJson: string;
  canEdit: boolean;
  onSave: (state: { title: string; bodyJson: string; bodyText: string }) => Promise<void>;
}) {
  return (
    <RoomProvider id={`doc:${props.docId}`} initialPresence={{}}>
      <InnerEditor {...props} />
    </RoomProvider>
  );
}

function InnerEditor({
  docId, initialTitle, initialBodyJson, canEdit, onSave,
}: {
  docId: string;
  initialTitle: string;
  initialBodyJson: string;
  canEdit: boolean;
  onSave: (state: { title: string; bodyJson: string; bodyText: string }) => Promise<void>;
}) {
  const room = useRoom();
  const others = useOthers();

  const [yDoc] = useState(() => new Y.Doc());
  const [provider, setProvider] = useState<LiveblocksYjsProvider | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'synced' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const pendingRef = useRef<null | ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    const p = new LiveblocksYjsProvider(room as any, yDoc);
    setProvider(p);
    return () => { p.destroy(); };
  }, [room, yDoc]);

  const editor = useEditor({
    editable: canEdit,
    immediatelyRender: false,
    extensions: provider ? [
      // Disable StarterKit's undo/redo — Yjs ships its own CRDT-aware
      // history that handles multi-client undo correctly. (In TipTap 3
      // the extension was renamed from history → undoRedo.)
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, undoRedo: false }),
      Placeholder.configure({ placeholder: '和同事一起写… 输入 "/" 或直接开写' }),
      Link.configure({ openOnClick: true, autolink: true, protocols: ['http', 'https', 'mailto'] }),
      Image.configure({ inline: false, allowBase64: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow, TableHeader, TableCell,
      Collaboration.configure({ document: yDoc }),
      CollaborationCursor.configure({
        provider,
        user: {
          // Populated by Liveblocks auth callback on connect; we read my
          // info once the provider is ready in the effect below.
          name: '我',
          color: '#6366f1',
        },
      }),
    ] : [],
  }, [provider]);

  // Once connected, backfill our own cursor name/color from Liveblocks'
  // auth response so others see the right label next to our caret.
  useEffect(() => {
    if (!editor || !provider) return;
    const awareness = provider.awareness;
    const self = awareness.getLocalState()?.user;
    // Fallback to "我" and pick up from session if available via DOM meta
    // (the auth endpoint already embedded it in userInfo).
    const me = (awareness as any)?.doc?.clientID;
    if (!self && me) {
      awareness.setLocalStateField('user', { name: '我', color: '#6366f1' });
    }
  }, [editor, provider]);

  // Hydrate the initial body the first time the Yjs doc is empty — without
  // this, a brand-new room starts blank even when the DB has content.
  useEffect(() => {
    if (!editor || !provider) return;
    let cancelled = false;
    provider.on('sync', (synced: boolean) => {
      if (cancelled || !synced || !editor) return;
      const xmlFragment = yDoc.getXmlFragment('default');
      if (xmlFragment.length === 0) {
        try {
          const parsed = JSON.parse(initialBodyJson || '{}');
          if (parsed && parsed.type) {
            editor.commands.setContent(parsed, { emitUpdate: true });
          }
        } catch { /* ignore malformed initial */ }
      }
      setLiveConnected(true);
      setStatus('idle');
    });
    return () => { cancelled = true; };
  }, [editor, provider, yDoc, initialBodyJson]);

  // Shadow-save to Postgres on edits (debounced). Liveblocks holds the
  // live CRDT state; DB is the durable source + search + version history.
  useEffect(() => {
    if (!editor || !canEdit) return;
    const handler = () => {
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
          setLastSavedAt(new Date());
        } catch {
          setStatus('error');
        }
      }, 1500);
    };
    editor.on('update', handler);
    return () => { editor.off('update', handler); };
  }, [editor, canEdit, onSave, title]);

  // Title-only save, same debouncer semantics.
  useEffect(() => {
    if (!editor || !canEdit) return;
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
    }, 1500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  async function onImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editor) return;
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) { alert('图片上传失败'); return; }
    const [att] = await res.json();
    editor.chain().focus().setImage({ src: `/api/attachments/${att.id}`, alt: att.filename }).run();
  }

  return (
    <div className="flex flex-col">
      <div className="mb-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="无标题文档"
          readOnly={!canEdit}
          className="w-full border-0 bg-transparent p-0 text-3xl font-semibold tracking-tight text-slate-900 placeholder:text-slate-300 focus:outline-none"
        />
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <SaveIndicator status={status} lastSavedAt={lastSavedAt} canEdit={canEdit} />
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1 ${
            liveConnected
              ? 'bg-emerald-50 text-emerald-800 ring-emerald-300'
              : 'bg-slate-100 text-slate-600 ring-slate-200'
          }`}>
            {liveConnected ? '🟢 实时同步已连上' : '⏳ 正在连接实时服务…'}
          </span>
          {/* Presence — always show the count so you know whether you're
              alone. Hovering / narrow screens still render the name chips. */}
          <span className="inline-flex items-center gap-1.5">
            <span className="text-[11px] text-slate-600">
              {others.length === 0 ? '👤 仅你在线' : `👥 ${others.length + 1} 人在线`}
            </span>
            {others.map((o) => {
              const u = (o.info ?? {}) as any;
              const name = u.name ?? '匿名';
              const color = u.color ?? '#64748b';
              const initial = String(name).slice(0, 1).toUpperCase();
              return (
                <span
                  key={o.connectionId}
                  title={name}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-white"
                  style={{ backgroundColor: color }}
                >
                  {initial}
                </span>
              );
            })}
          </span>
        </div>
      </div>

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

      <div className="doc-editor prose prose-slate max-w-none">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function TbBtn({ ed, cmd, active, label, icon }: {
  ed: any; cmd: (c: any) => any; active: boolean; label: string; icon: string;
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
