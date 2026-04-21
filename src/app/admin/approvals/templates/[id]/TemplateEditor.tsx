'use client';

import '@xyflow/react/dist/style.css';

import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  Handle,
  Position,
  type Connection,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import { useRouter } from 'next/navigation';
import {
  APPROVAL_CATEGORY_META,
  FIELD_TYPE_META,
  parseFlow,
  parseFields,
  type FieldType,
  type FlowNode,
  type FlowGraph,
  type FormFieldSpec,
} from '@/lib/approvalFlow';

type UserOpt = { id: string; name: string | null; email: string; image: string | null };
type DeptOpt = { id: string; name: string };

type Props = {
  templateId: string;
  initialName: string;
  initialCategory: string;
  initialDescription: string;
  initialFlow: string;
  initialFields: string;
  users: UserOpt[];
  departments: DeptOpt[];
};

function nodeLabel(n: FlowNode) {
  if (n.type === 'start') return '发起人';
  if (n.type === 'end') return '结束';
  if (n.type === 'approval') return n.data.label || '审批';
  if (n.type === 'cc') return n.data.label || '抄送';
  return '节点';
}

// ---------- Custom node components ----------

function StartNode({ data }: NodeProps) {
  return (
    <div className="relative flex min-w-[140px] items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
      <span>🚀 {String((data as any)?.label ?? '发起人')}</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function EndNode({ data }: NodeProps) {
  return (
    <div className="relative flex min-w-[140px] items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg">
      <Handle type="target" position={Position.Top} />
      <span>🏁 {String((data as any)?.label ?? '结束')}</span>
    </div>
  );
}

function ApprovalNode({ data, selected }: NodeProps) {
  const d = data as any;
  const count = (d.approvers as string[] | undefined)?.length ?? 0;
  return (
    <div className={`relative min-w-[180px] rounded-xl bg-white px-4 py-3 text-sm shadow-lg ring-2 ${selected ? 'ring-amber-400' : 'ring-slate-200'}`}>
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-1.5 font-semibold text-slate-800">
        <span>👤</span>
        <span>{d.label || '审批'}</span>
      </div>
      <div className="mt-1 text-xs text-slate-500">
        {count === 0 ? <span className="text-rose-600">⚠ 未设审批人</span> : <>
          {count} 人 · {d.mode === 'ANY' ? '或签' : '会签'}
        </>}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function CcNode({ data, selected }: NodeProps) {
  const d = data as any;
  const count = (d.ccUsers as string[] | undefined)?.length ?? 0;
  return (
    <div className={`relative min-w-[180px] rounded-xl bg-amber-50 px-4 py-3 text-sm shadow ring-2 ${selected ? 'ring-amber-400' : 'ring-amber-200'}`}>
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-1.5 font-semibold text-amber-900">
        <span>📨</span>
        <span>{d.label || '抄送'}</span>
      </div>
      <div className="mt-1 text-xs text-amber-700">
        {count === 0 ? <span>⚠ 未设抄送人</span> : <>{count} 人抄送</>}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { start: StartNode, end: EndNode, approval: ApprovalNode, cc: CcNode };

// ---------- Main editor ----------

export default function TemplateEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <EditorInner {...props} />
    </ReactFlowProvider>
  );
}

function EditorInner({
  templateId, initialName, initialCategory, initialDescription,
  initialFlow, initialFields, users, departments,
}: Props) {
  const router = useRouter();
  const parsedFlow = useMemo(() => parseFlow(initialFlow), [initialFlow]);
  const parsedFields = useMemo(() => parseFields(initialFields), [initialFields]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(parsedFlow.nodes as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(parsedFlow.edges as Edge[]);
  const [fields, setFields] = useState<FormFieldSpec[]>(parsedFields);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState(initialCategory);
  const [description, setDescription] = useState(initialDescription);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, id: `e-${params.source}-${params.target}-${Date.now()}` }, eds)),
    [setEdges]
  );

  function addNode(type: 'approval' | 'cc') {
    const id = `n_${Math.random().toString(36).slice(2, 8)}`;
    const newNode: Node = {
      id,
      type,
      position: { x: 200 + Math.random() * 40, y: 280 + nodes.length * 30 },
      data: type === 'approval'
        ? { label: '审批人', approvers: [], mode: 'ALL' }
        : { label: '抄送', ccUsers: [] },
    };
    setNodes((prev) => [...prev, newNode]);
  }

  function updateSelectedNodeData(patch: any) {
    if (!selectedId) return;
    setNodes((prev) => prev.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n)));
  }

  function deleteSelectedNode() {
    if (!selectedId) return;
    const node = nodes.find((n) => n.id === selectedId);
    if (!node || node.type === 'start' || node.type === 'end') {
      alert('起点和结束节点不能删除');
      return;
    }
    setNodes((prev) => prev.filter((n) => n.id !== selectedId));
    setEdges((prev) => prev.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  }

  // ---- Form field ops ----
  function addField(type: FieldType) {
    const id = `f_${Math.random().toString(36).slice(2, 8)}`;
    setFields((prev) => [...prev, {
      id, type, label: FIELD_TYPE_META[type].label,
      required: false,
      options: type === 'select' || type === 'multiselect' ? ['选项 1', '选项 2'] : undefined,
    }]);
  }
  function updateField(id: string, patch: Partial<FormFieldSpec>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }
  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }
  function moveField(id: string, direction: -1 | 1) {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === id);
      if (idx < 0) return prev;
      const to = idx + direction;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
  }

  async function save(activate = true) {
    setSaving(true); setMsg(null);
    try {
      // Basic validation
      const hasStart = nodes.some((n) => n.type === 'start');
      const hasEnd = nodes.some((n) => n.type === 'end');
      if (!hasStart || !hasEnd) throw new Error('必须包含起点和结束节点');

      const approvalNodes = nodes.filter((n) => n.type === 'approval');
      for (const n of approvalNodes) {
        const d: any = n.data;
        if (!d.approvers || d.approvers.length === 0) {
          throw new Error(`节点"${d.label || n.id}"还没有设审批人`);
        }
      }

      const flow: FlowGraph = {
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type as any,
          position: n.position,
          data: n.data as any,
        })),
        edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      };

      const res = await fetch(`/api/approvals/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, category, description: description || null,
          flowJson: JSON.stringify(flow),
          fieldsJson: JSON.stringify(fields),
          active: activate,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '保存失败');
      setMsg('✓ 已保存');
      router.refresh();
      setTimeout(() => setMsg(null), 2500);
    } catch (e: any) { setMsg(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      {/* Top toolbar */}
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">名称</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
        </div>
        <div className="w-32">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">分类</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="select">
            {Object.entries(APPROVAL_CATEGORY_META).map(([k, v]) => (
              <option key={k} value={k}>{v.icon} {v.label}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">简介</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="input" placeholder="一句话说明这个流程" />
        </div>
        <button onClick={() => save(true)} disabled={saving} className="btn btn-primary">
          {saving ? '保存中…' : '保存并启用'}
        </button>
      </div>

      {msg && <div className={`rounded-xl px-3 py-2 text-sm ${msg.startsWith('✓') ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'}`}>{msg}</div>}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* Canvas */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-sm">
            <span className="font-semibold">🎨 流程画布</span>
            <div className="flex items-center gap-2">
              <button onClick={() => addNode('approval')} className="btn btn-ghost text-xs">+ 审批节点</button>
              <button onClick={() => addNode('cc')} className="btn btn-ghost text-xs">+ 抄送节点</button>
            </div>
          </div>
          <div className="h-[520px]">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onSelectionChange={({ nodes: n }) => setSelectedId(n[0]?.id ?? null)}
              fitView
            >
              <Background gap={16} size={1} />
              <MiniMap />
              <Controls />
            </ReactFlow>
          </div>
        </div>

        {/* Right panel: selected node + fields */}
        <div className="space-y-4">
          <div className="card p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              ⚙️ 节点设置 {selected ? `· ${selected.type}` : ''}
            </div>
            {!selected ? (
              <p className="text-xs text-slate-500">在画布上点选一个节点来设置。拖拽节点圆圈可连线。</p>
            ) : (selected.type === 'start' || selected.type === 'end') ? (
              <p className="text-xs text-slate-500">起点 / 结束 节点不需要配置。</p>
            ) : selected.type === 'approval' ? (
              <ApprovalSettings node={selected} users={users} onChange={updateSelectedNodeData} onDelete={deleteSelectedNode} />
            ) : selected.type === 'cc' ? (
              <CcSettings node={selected} users={users} onChange={updateSelectedNodeData} onDelete={deleteSelectedNode} />
            ) : null}
          </div>

          <div className="card p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">📝 表单字段</span>
            </div>
            <div className="mb-3 flex flex-wrap gap-1">
              {Object.entries(FIELD_TYPE_META).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => addField(k as FieldType)}
                  className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-200"
                  title={v.label}
                >
                  {v.icon} {v.label}
                </button>
              ))}
            </div>
            {fields.length === 0 ? (
              <p className="text-xs text-slate-500">还没有字段。点上面的类型来添加。</p>
            ) : (
              <ul className="space-y-2">
                {fields.map((f, i) => (
                  <li key={f.id} className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-100">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs">{FIELD_TYPE_META[f.type].icon}</span>
                      <input
                        value={f.label}
                        onChange={(e) => updateField(f.id, { label: e.target.value })}
                        className="flex-1 rounded bg-white px-2 py-1 text-xs ring-1 ring-slate-200"
                      />
                      <button onClick={() => moveField(f.id, -1)} disabled={i === 0} className="px-1 text-slate-500 disabled:opacity-30">▲</button>
                      <button onClick={() => moveField(f.id, 1)} disabled={i === fields.length - 1} className="px-1 text-slate-500 disabled:opacity-30">▼</button>
                      <button onClick={() => removeField(f.id)} className="px-1 text-rose-500">✕</button>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px]">
                      <label className="flex items-center gap-1 text-slate-600">
                        <input type="checkbox" checked={!!f.required} onChange={(e) => updateField(f.id, { required: e.target.checked })} />
                        必填
                      </label>
                      <label className="flex items-center gap-1 text-slate-600">
                        <input type="checkbox" checked={!!f.titleField} onChange={(e) => updateField(f.id, { titleField: e.target.checked })} />
                        作为标题
                      </label>
                    </div>
                    {(f.type === 'select' || f.type === 'multiselect') && (
                      <div className="mt-1">
                        <input
                          value={(f.options ?? []).join('|')}
                          onChange={(e) => updateField(f.id, { options: e.target.value.split('|').map((s) => s.trim()).filter(Boolean) })}
                          placeholder="选项用 | 分隔：正常|紧急|特殊"
                          className="w-full rounded bg-white px-2 py-1 text-[11px] ring-1 ring-slate-200"
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ApprovalSettings({
  node, users, onChange, onDelete,
}: {
  node: Node;
  users: UserOpt[];
  onChange: (patch: any) => void;
  onDelete: () => void;
}) {
  const d: any = node.data;
  const selected: string[] = d.approvers ?? [];
  const mode: 'ALL' | 'ANY' = d.mode ?? 'ALL';

  function toggle(id: string) {
    onChange({ approvers: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id] });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">节点名称</label>
        <input value={d.label ?? ''} onChange={(e) => onChange({ label: e.target.value })} className="input" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">多人审批方式</label>
        <div className="flex gap-2">
          <label className={`flex-1 cursor-pointer rounded-lg px-2.5 py-1.5 text-xs text-center ring-1 ${mode === 'ALL' ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200'}`}>
            <input type="radio" className="hidden" checked={mode === 'ALL'} onChange={() => onChange({ mode: 'ALL' })} />
            会签（全部同意）
          </label>
          <label className={`flex-1 cursor-pointer rounded-lg px-2.5 py-1.5 text-xs text-center ring-1 ${mode === 'ANY' ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200'}`}>
            <input type="radio" className="hidden" checked={mode === 'ANY'} onChange={() => onChange({ mode: 'ANY' })} />
            或签（一人同意即可）
          </label>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">审批人（多选）</label>
        <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1">
          <ul className="space-y-0.5">
            {users.map((u) => (
              <li key={u.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-slate-50">
                  <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} />
                  <span>{u.name ?? u.email}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <button onClick={onDelete} className="text-xs text-rose-600">删除此节点</button>
    </div>
  );
}

function CcSettings({
  node, users, onChange, onDelete,
}: {
  node: Node;
  users: UserOpt[];
  onChange: (patch: any) => void;
  onDelete: () => void;
}) {
  const d: any = node.data;
  const selected: string[] = d.ccUsers ?? [];

  function toggle(id: string) {
    onChange({ ccUsers: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id] });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">节点名称</label>
        <input value={d.label ?? ''} onChange={(e) => onChange({ label: e.target.value })} className="input" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">抄送成员</label>
        <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1">
          <ul className="space-y-0.5">
            {users.map((u) => (
              <li key={u.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-slate-50">
                  <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} />
                  <span>{u.name ?? u.email}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <button onClick={onDelete} className="text-xs text-rose-600">删除此节点</button>
    </div>
  );
}
