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

function ConditionNode({ data, selected }: NodeProps) {
  const d = data as any;
  const configured = d.field && d.op;
  return (
    <div className={`relative min-w-[180px] rounded-xl bg-violet-50 px-4 py-3 text-sm shadow ring-2 ${selected ? 'ring-violet-400' : 'ring-violet-200'}`}>
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-1.5 font-semibold text-violet-900">
        <span>🔀</span>
        <span>{d.label || '条件分支'}</span>
      </div>
      <div className="mt-1 text-xs text-violet-700">
        {configured ? (
          <span>{d.field} {d.op} {d.value}</span>
        ) : (
          <span>⚠ 未设条件</span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { start: StartNode, end: EndNode, approval: ApprovalNode, cc: CcNode, condition: ConditionNode };

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

  function addNode(type: 'approval' | 'cc' | 'condition') {
    const id = `n_${Math.random().toString(36).slice(2, 8)}`;
    const newNode: Node = {
      id,
      type,
      position: { x: 200 + Math.random() * 40, y: 280 + nodes.length * 30 },
      data:
        type === 'approval'  ? { label: '审批人', approvers: [], mode: 'ALL', approverSource: 'SPECIFIC' } :
        type === 'cc'        ? { label: '抄送', ccUsers: [] } :
                               { label: '条件分支', field: '', op: '==', value: '' },
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
        const src = d.approverSource ?? 'SPECIFIC';
        if (src === 'SPECIFIC') {
          if (!d.approvers || d.approvers.length === 0) {
            throw new Error(`节点"${d.label || n.id}"还没有设审批人`);
          }
        } else if (src === 'DEPT_LEAD') {
          if (!d.sourceDepartmentId) {
            throw new Error(`节点"${d.label || n.id}"需要指定一个部门（其负责人作为审批人）`);
          }
        }
        // INITIATOR_DEPT_LEAD: resolved at submit time; no config needed
      }

      const conditionNodes = nodes.filter((n) => n.type === 'condition');
      for (const n of conditionNodes) {
        const d: any = n.data;
        if (!d.field || !d.op) {
          throw new Error(`条件节点"${d.label || n.id}"没有设置判断条件`);
        }
        if (!d.trueTargetId || !d.falseTargetId) {
          throw new Error(`条件节点"${d.label || n.id}"没有指定"满足时去"和"不满足时去"的节点`);
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
              <button onClick={() => addNode('approval')} className="btn btn-ghost text-xs">+ 审批</button>
              <button onClick={() => addNode('cc')} className="btn btn-ghost text-xs">+ 抄送</button>
              <button onClick={() => addNode('condition')} className="btn btn-ghost text-xs">+ 条件分支</button>
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
              <ApprovalSettings node={selected} users={users} departments={departments} onChange={updateSelectedNodeData} onDelete={deleteSelectedNode} />
            ) : selected.type === 'cc' ? (
              <CcSettings node={selected} users={users} onChange={updateSelectedNodeData} onDelete={deleteSelectedNode} />
            ) : selected.type === 'condition' ? (
              <ConditionSettings node={selected} fields={fields} allNodes={nodes} onChange={updateSelectedNodeData} onDelete={deleteSelectedNode} />
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
  node, users, departments, onChange, onDelete,
}: {
  node: Node;
  users: UserOpt[];
  departments: DeptOpt[];
  onChange: (patch: any) => void;
  onDelete: () => void;
}) {
  const d: any = node.data;
  const selected: string[] = d.approvers ?? [];
  const mode: 'ALL' | 'ANY' = d.mode ?? 'ALL';
  const source: 'SPECIFIC' | 'INITIATOR_DEPT_LEAD' | 'DEPT_LEAD' = d.approverSource ?? 'SPECIFIC';

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
        <label className="mb-1 block text-xs font-medium text-slate-500">审批人类型</label>
        <div className="grid grid-cols-1 gap-1">
          {[
            { v: 'SPECIFIC',              label: '指定成员' },
            { v: 'INITIATOR_DEPT_LEAD',   label: '发起人所在部门的负责人' },
            { v: 'DEPT_LEAD',             label: '指定部门的负责人' },
          ].map((opt) => (
            <label key={opt.v} className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-xs ring-1 ${source === opt.v ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200'}`}>
              <input type="radio" className="hidden" checked={source === opt.v} onChange={() => onChange({ approverSource: opt.v })} />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {source === 'DEPT_LEAD' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">目标部门</label>
          <select
            value={d.sourceDepartmentId ?? ''}
            onChange={(e) => onChange({ sourceDepartmentId: e.target.value || null })}
            className="select"
          >
            <option value="">—— 选择部门 ——</option>
            {departments.map((dp) => <option key={dp.id} value={dp.id}>{dp.name}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">多人审批方式</label>
        <div className="flex gap-2">
          <label className={`flex-1 cursor-pointer rounded-lg px-2.5 py-1.5 text-xs text-center ring-1 ${mode === 'ALL' ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200'}`}>
            <input type="radio" className="hidden" checked={mode === 'ALL'} onChange={() => onChange({ mode: 'ALL' })} />
            会签
          </label>
          <label className={`flex-1 cursor-pointer rounded-lg px-2.5 py-1.5 text-xs text-center ring-1 ${mode === 'ANY' ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200'}`}>
            <input type="radio" className="hidden" checked={mode === 'ANY'} onChange={() => onChange({ mode: 'ANY' })} />
            或签
          </label>
        </div>
      </div>

      {source === 'SPECIFIC' ? (
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
      ) : (
        <p className="rounded bg-indigo-50 px-2 py-1.5 text-[11px] text-indigo-800 ring-1 ring-indigo-100">
          ℹ️ 审批人将在每次提交时自动解析。你可以再勾选下方"备选"成员作为兜底，在解析不到时使用。
        </p>
      )}

      {source !== 'SPECIFIC' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">备选审批人（可选）</label>
          <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1">
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
      )}

      <button onClick={onDelete} className="text-xs text-rose-600">删除此节点</button>
    </div>
  );
}

function ConditionSettings({
  node, fields, allNodes, onChange, onDelete,
}: {
  node: Node;
  fields: FormFieldSpec[];
  allNodes: Node[];
  onChange: (patch: any) => void;
  onDelete: () => void;
}) {
  const d: any = node.data;
  const targetOptions = allNodes.filter((n) => n.id !== node.id && n.type !== 'start');
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">节点名称</label>
        <input value={d.label ?? ''} onChange={(e) => onChange({ label: e.target.value })} className="input" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">判断字段</label>
        <select value={d.field ?? ''} onChange={(e) => onChange({ field: e.target.value })} className="select">
          <option value="">—— 选择表单字段 ——</option>
          {fields.map((f) => <option key={f.id} value={f.id}>{f.label} ({f.type})</option>)}
        </select>
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <select value={d.op ?? '=='} onChange={(e) => onChange({ op: e.target.value })} className="select w-24">
          <option value="==">等于</option>
          <option value="!=">不等于</option>
          <option value=">">大于</option>
          <option value="<">小于</option>
          <option value=">=">≥</option>
          <option value="<=">≤</option>
          <option value="contains">包含</option>
        </select>
        <input value={d.value ?? ''} onChange={(e) => onChange({ value: e.target.value })} placeholder="对比值" className="input" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">✅ 满足时去</label>
        <select value={d.trueTargetId ?? ''} onChange={(e) => onChange({ trueTargetId: e.target.value })} className="select">
          <option value="">—— 选择目标节点 ——</option>
          {targetOptions.map((n) => <option key={n.id} value={n.id}>{(n.data as any).label ?? n.id} ({n.type})</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">❌ 不满足时去</label>
        <select value={d.falseTargetId ?? ''} onChange={(e) => onChange({ falseTargetId: e.target.value })} className="select">
          <option value="">—— 选择目标节点 ——</option>
          {targetOptions.map((n) => <option key={n.id} value={n.id}>{(n.data as any).label ?? n.id} ({n.type})</option>)}
        </select>
      </div>
      <p className="rounded bg-violet-50 px-2 py-1.5 text-[11px] text-violet-800 ring-1 ring-violet-100">
        ℹ️ 条件节点从表单值评估后直接跳到指定节点，画布上的连线仅用于可视化（实际以上面选择的"去"为准）。
      </p>
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
