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
  MarkerType,
  type Connection,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import Link from 'next/link';
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
  if (n.type === 'condition') return n.data.label || '条件';
  return '节点';
}

// Order nodes start → ...middle... → end in a tidy vertical column.
// Topologically sort if possible; otherwise preserve array order. Keeps
// condition nodes and branch targets vertically aligned so the canvas
// doesn't turn into spaghetti.
function autoLayout<N extends Node>(nodes: N[], edges: Edge[], pinned: string[] = []): N[] {
  if (nodes.length === 0) return nodes;
  const start = nodes.find((n) => n.type === 'start');
  const end = nodes.find((n) => n.type === 'end');
  const others = nodes.filter((n) => n.type !== 'start' && n.type !== 'end');

  // Topological pass: BFS from start following outgoing edges.
  const order: string[] = [];
  if (start) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const visited = new Set<string>();
    const queue: string[] = [start.id];
    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      order.push(id);
      edges.filter((e) => e.source === id).forEach((e) => {
        if (!visited.has(e.target) && byId.has(e.target)) queue.push(e.target);
      });
    }
    // Append anything not reached (orphans) at the end.
    others.forEach((n) => { if (!visited.has(n.id)) order.push(n.id); });
  }

  const sequence = order.length ? order : [start, ...others, end].filter(Boolean).map((n) => (n as N).id);
  const colX = 240;
  const rowH = 140;
  return nodes.map((n) => {
    if (pinned.includes(n.id)) return n;
    const idx = sequence.indexOf(n.id);
    const y = idx >= 0 ? 60 + idx * rowH : n.position.y;
    return { ...n, position: { x: colX, y } };
  });
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
    (params: Connection) => setEdges((eds) => addEdge({
      ...params,
      id: `e-${params.source}-${params.target}-${Date.now()}`,
      markerEnd: { type: MarkerType.ArrowClosed },
    }, eds)),
    [setEdges]
  );

  // Smart add: insert the new node between the end node and whatever feeds
  // into end. User no longer has to drag connections manually for the common
  // "add one more step before end" case.
  function addNode(type: 'approval' | 'cc' | 'condition') {
    const id = `n_${Math.random().toString(36).slice(2, 8)}`;
    const newNode: Node = {
      id,
      type,
      position: { x: 200, y: 0 }, // auto-laid-out below
      data:
        type === 'approval'  ? { label: ({ approval: '审批', cc: '抄送', condition: '条件' } as any)[type] + ` ${nodes.filter((n) => n.type === type).length + 1}`, approvers: [], mode: 'ALL', approverSource: 'SPECIFIC' } :
        type === 'cc'        ? { label: `抄送 ${nodes.filter((n) => n.type === 'cc').length + 1}`, ccUsers: [] } :
                               { label: `条件 ${nodes.filter((n) => n.type === 'condition').length + 1}`, field: '', op: '==', value: '' },
    };

    setNodes((prev) => {
      const next = [...prev, newNode];
      return autoLayout(next, edges, type === 'condition' ? [newNode.id] : []);
    });

    // Auto-wire: find incoming edge to "end", reroute it through the new node.
    // For condition nodes, we leave the user to pick trueTarget/falseTarget
    // explicitly in the side panel — but we still give a placeholder edge
    // from the predecessor so the canvas doesn't look disconnected.
    setEdges((prevEdges) => {
      const endNode = nodes.find((n) => n.type === 'end');
      if (!endNode) return prevEdges;
      const feeders = prevEdges.filter((e) => e.target === endNode.id);
      // Choose the predecessor: if there's exactly one feeder, reroute it.
      // Otherwise just connect start → newNode → end as a fallback.
      let withoutOld = prevEdges;
      let sourceId: string;
      if (feeders.length === 1) {
        withoutOld = prevEdges.filter((e) => e.id !== feeders[0].id);
        sourceId = feeders[0].source;
      } else {
        const start = nodes.find((n) => n.type === 'start');
        sourceId = start?.id ?? endNode.id;
      }
      return [
        ...withoutOld,
        { id: `e-${sourceId}-${id}-${Date.now()}`, source: sourceId, target: id, markerEnd: { type: MarkerType.ArrowClosed } },
        { id: `e-${id}-${endNode.id}-${Date.now() + 1}`, source: id, target: endNode.id, markerEnd: { type: MarkerType.ArrowClosed } },
      ];
    });
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
    // Before removing, stitch the predecessor(s) to the successor(s) so we
    // don't leave the canvas disconnected.
    const incoming = edges.filter((e) => e.target === selectedId);
    const outgoing = edges.filter((e) => e.source === selectedId);
    const bridge: Edge[] = [];
    for (const i of incoming) {
      for (const o of outgoing) {
        bridge.push({
          id: `e-${i.source}-${o.target}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          source: i.source,
          target: o.target,
          markerEnd: { type: MarkerType.ArrowClosed },
        });
      }
    }
    setNodes((prev) => autoLayout(prev.filter((n) => n.id !== selectedId), edges));
    setEdges((prev) => [
      ...prev.filter((e) => e.source !== selectedId && e.target !== selectedId),
      ...bridge,
    ]);
    setSelectedId(null);
  }

  function tidyLayout() {
    setNodes((prev) => autoLayout(prev, edges));
  }

  // Drop-in presets — each seeds nodes/edges AND form fields so the submit
  // page actually has something to fill in. Previously blank templates had
  // no fields other than what the author manually added.
  function applyPreset(preset: 'LEAVE' | 'EXPENSE' | 'TRAVEL' | 'PROCUREMENT' | 'STAMP' | 'OVERTIME') {
    if ((nodes.length > 3 || fields.length > 0) && !confirm('当前已有节点或字段，应用预设会覆盖现有内容，确定继续？')) return;
    const start: Node = { id: 'start', type: 'start', position: { x: 240, y: 60 }, data: { label: '发起人' } };
    const end: Node = { id: 'end', type: 'end', position: { x: 240, y: 800 }, data: { label: '结束' } };
    let newNodes: Node[] = [start];
    let newEdges: Edge[] = [];
    let newFields: FormFieldSpec[] = [];
    const connect = (a: string, b: string) => newEdges.push({ id: `e-${a}-${b}`, source: a, target: b, markerEnd: { type: MarkerType.ArrowClosed } });
    const fid = () => `f_${Math.random().toString(36).slice(2, 8)}`;

    if (preset === 'LEAVE') {
      setName((n) => n || '请假申请');
      setCategory('LEAVE');
      newFields = [
        { id: fid(), type: 'select', label: '请假类型', required: true, titleField: true,
          options: ['年假', '调休', '事假', '病假', '婚假', '丧假', '产假', '陪护假'] },
        { id: fid(), type: 'daterange', label: '请假起止日期', required: true },
        { id: fid(), type: 'leave_days', label: '请假天数', required: true },
        { id: fid(), type: 'textarea', label: '请假事由', required: true, placeholder: '请简述原因' },
        { id: fid(), type: 'textarea', label: '工作交接', required: false, placeholder: '由谁代替完成哪些工作' },
        { id: fid(), type: 'attachment', label: '证明材料（如需）' },
      ];
      const a1: Node = { id: 'a1', type: 'approval', position: { x: 240, y: 220 }, data: { label: '直属上级', approvers: [], mode: 'ALL', approverSource: 'INITIATOR_DEPT_LEAD' } };
      const cc: Node = { id: 'c1', type: 'cc', position: { x: 240, y: 380 }, data: { label: '抄送 HR', ccUsers: [] } };
      newNodes.push(a1, cc, end);
      connect('start', 'a1'); connect('a1', 'c1'); connect('c1', 'end');
    } else if (preset === 'EXPENSE') {
      setName((n) => n || '报销申请');
      setCategory('EXPENSE');
      newFields = [
        { id: fid(), type: 'select', label: '费用类别', required: true, options: ['差旅', '餐饮', '交通', '办公用品', '通讯', '培训', '其他'], titleField: true },
        { id: fid(), type: 'money', label: '报销金额', required: true, defaultCurrency: 'CNY', allowCurrencySwitch: true },
        { id: fid(), type: 'date', label: '发生日期', required: true },
        { id: fid(), type: 'textarea', label: '费用说明', required: true, placeholder: '具体用途、参与人、事由' },
        { id: fid(), type: 'attachment', label: '发票 / 凭证', required: true },
      ];
      // Condition: 金额 > 5000 走 CEO
      const amtField = newFields.find((f) => f.type === 'money')!.id;
      const cond: Node = { id: 'cond', type: 'condition', position: { x: 240, y: 220 }, data: { label: '金额判断', field: amtField, op: '>', value: '5000', trueTargetId: 'a_big', falseTargetId: 'a_small' } };
      const aSmall: Node = { id: 'a_small', type: 'approval', position: { x: 80, y: 400 }, data: { label: '部门负责人', approvers: [], mode: 'ALL', approverSource: 'INITIATOR_DEPT_LEAD' } };
      const aBig: Node = { id: 'a_big', type: 'approval', position: { x: 420, y: 400 }, data: { label: '部门负责人 + 总经理', approvers: [], mode: 'ALL', approverSource: 'SPECIFIC' } };
      const cc: Node = { id: 'c1', type: 'cc', position: { x: 240, y: 560 }, data: { label: '抄送财务', ccUsers: [] } };
      newNodes.push(cond, aSmall, aBig, cc, end);
      connect('start', 'cond');
      newEdges.push({ id: 'e-cond-small', source: 'cond', target: 'a_small', label: '≤ 5000', markerEnd: { type: MarkerType.ArrowClosed } });
      newEdges.push({ id: 'e-cond-big',   source: 'cond', target: 'a_big',   label: '> 5000', markerEnd: { type: MarkerType.ArrowClosed } });
      connect('a_small', 'c1'); connect('a_big', 'c1'); connect('c1', 'end');
    } else if (preset === 'TRAVEL') {
      setName((n) => n || '出差申请');
      setCategory('TRAVEL');
      newFields = [
        { id: fid(), type: 'text', label: '目的地', required: true, titleField: true },
        { id: fid(), type: 'daterange', label: '出差起止日期', required: true },
        { id: fid(), type: 'textarea', label: '出差目的', required: true },
        { id: fid(), type: 'money', label: '预算金额', required: true },
        { id: fid(), type: 'select', label: '交通方式', options: ['飞机', '高铁', '汽车', '其他'], required: false },
        { id: fid(), type: 'attachment', label: '行程附件（如需）' },
      ];
      const a1: Node = { id: 'a1', type: 'approval', position: { x: 240, y: 220 }, data: { label: '直属上级', approvers: [], mode: 'ALL', approverSource: 'INITIATOR_DEPT_LEAD' } };
      const a2: Node = { id: 'a2', type: 'approval', position: { x: 240, y: 380 }, data: { label: '总经理', approvers: [], mode: 'ALL', approverSource: 'SPECIFIC' } };
      const cc: Node = { id: 'c1', type: 'cc', position: { x: 240, y: 540 }, data: { label: '抄送财务', ccUsers: [] } };
      newNodes.push(a1, a2, cc, end);
      connect('start', 'a1'); connect('a1', 'a2'); connect('a2', 'c1'); connect('c1', 'end');
    } else if (preset === 'PROCUREMENT') {
      setName((n) => n || '采购申请');
      setCategory('PROCUREMENT');
      newFields = [
        { id: fid(), type: 'text', label: '物品名称', required: true, titleField: true },
        { id: fid(), type: 'number', label: '数量', required: true },
        { id: fid(), type: 'money', label: '预算金额', required: true },
        { id: fid(), type: 'text', label: '供应商', required: false },
        { id: fid(), type: 'textarea', label: '用途说明', required: true },
        { id: fid(), type: 'attachment', label: '报价单 / 参考链接' },
      ];
      const a1: Node = { id: 'a1', type: 'approval', position: { x: 240, y: 220 }, data: { label: '直属上级', approvers: [], mode: 'ALL', approverSource: 'INITIATOR_DEPT_LEAD' } };
      const a2: Node = { id: 'a2', type: 'approval', position: { x: 240, y: 380 }, data: { label: '财务审批', approvers: [], mode: 'ALL', approverSource: 'SPECIFIC' } };
      newNodes.push(a1, a2, end);
      connect('start', 'a1'); connect('a1', 'a2'); connect('a2', 'end');
    } else if (preset === 'STAMP') {
      setName((n) => n || '用章申请');
      setCategory('STAMP');
      newFields = [
        { id: fid(), type: 'select', label: '印章类型', required: true, options: ['公章', '财务章', '合同章', '法人章', '其他'], titleField: true },
        { id: fid(), type: 'textarea', label: '用章事由', required: true },
        { id: fid(), type: 'select', label: '紧急程度', options: ['普通', '紧急', '特急'], required: true },
        { id: fid(), type: 'attachment', label: '待盖章文件', required: true },
      ];
      const a1: Node = { id: 'a1', type: 'approval', position: { x: 240, y: 220 }, data: { label: '法务', approvers: [], mode: 'ALL', approverSource: 'SPECIFIC' } };
      const a2: Node = { id: 'a2', type: 'approval', position: { x: 240, y: 380 }, data: { label: '总经理', approvers: [], mode: 'ALL', approverSource: 'SPECIFIC' } };
      newNodes.push(a1, a2, end);
      connect('start', 'a1'); connect('a1', 'a2'); connect('a2', 'end');
    } else if (preset === 'OVERTIME') {
      setName((n) => n || '加班申请');
      setCategory('OVERTIME');
      newFields = [
        { id: fid(), type: 'datetime', label: '开始时间', required: true, titleField: true },
        { id: fid(), type: 'datetime', label: '结束时间', required: true },
        { id: fid(), type: 'textarea', label: '加班事由', required: true, placeholder: '加班内容 / 工作项目' },
        { id: fid(), type: 'attachment', label: '相关附件（可选）' },
      ];
      const a1: Node = { id: 'a1', type: 'approval', position: { x: 240, y: 220 }, data: { label: '直属上级', approvers: [], mode: 'ALL', approverSource: 'INITIATOR_DEPT_LEAD' } };
      const cc: Node = { id: 'c1', type: 'cc', position: { x: 240, y: 380 }, data: { label: '抄送 HR', ccUsers: [] } };
      newNodes.push(a1, cc, end);
      connect('start', 'a1'); connect('a1', 'c1'); connect('c1', 'end');
    }

    setNodes(newNodes);
    setEdges(newEdges);
    setFields(newFields);
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

  async function save(activate = true, exitAfter = false) {
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
      if (exitAfter) {
        setTimeout(() => router.push('/admin/approvals/templates'), 600);
      } else {
        setTimeout(() => setMsg(null), 2500);
      }
    } catch (e: any) { setMsg(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      {/* Sticky action bar with back + save — solves "no way to exit" */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-white">
        <Link href="/admin/approvals/templates" className="inline-flex items-center gap-1.5 text-sm text-slate-200 hover:text-white">
          ← 返回模板列表
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => save(false, false)} disabled={saving} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20 disabled:opacity-50">
            {saving ? '…' : '暂存草稿'}
          </button>
          <button onClick={() => save(true, true)} disabled={saving} className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-50">
            {saving ? '保存中…' : '✓ 保存并退出'}
          </button>
        </div>
      </div>

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
      </div>

      {/* Preset dropdown for non-designers — each preset bundles the typical
          form fields AND the flow so admin only picks approvers. */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
        <div className="mb-1.5"><span className="font-medium">🎨 从常用模板开始</span>（含表单字段 + 流程，应用后改审批人即可）：</div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => applyPreset('LEAVE')} className="rounded-full bg-white px-2.5 py-0.5 ring-1 ring-indigo-200 hover:bg-indigo-100">🌴 请假</button>
          <button onClick={() => applyPreset('OVERTIME')} className="rounded-full bg-white px-2.5 py-0.5 ring-1 ring-indigo-200 hover:bg-indigo-100">⏱ 加班（1:1 抵调休）</button>
          <button onClick={() => applyPreset('EXPENSE')} className="rounded-full bg-white px-2.5 py-0.5 ring-1 ring-indigo-200 hover:bg-indigo-100">💰 报销（金额分支）</button>
          <button onClick={() => applyPreset('TRAVEL')} className="rounded-full bg-white px-2.5 py-0.5 ring-1 ring-indigo-200 hover:bg-indigo-100">✈️ 出差</button>
          <button onClick={() => applyPreset('PROCUREMENT')} className="rounded-full bg-white px-2.5 py-0.5 ring-1 ring-indigo-200 hover:bg-indigo-100">📦 采购</button>
          <button onClick={() => applyPreset('STAMP')} className="rounded-full bg-white px-2.5 py-0.5 ring-1 ring-indigo-200 hover:bg-indigo-100">🔖 用章</button>
        </div>
      </div>

      <LeaveFieldsUpgrader
        fields={fields}
        expenseCurrencyNeeded={fields.some((f) => f.type === 'money' && !f.defaultCurrency)}
        onUpgradeLeave={() => setFields((prev) => upgradeLeaveFields(prev))}
        onUpgradeMoney={() => setFields((prev) => upgradeMoneyFields(prev))}
      />

      {msg && <div className={`rounded-xl px-3 py-2 text-sm ${msg.startsWith('✓') ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'}`}>{msg}</div>}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* Canvas */}
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-100 px-4 py-2 text-sm">
            <span className="font-semibold">🎨 流程画布</span>
            <div className="flex items-center gap-2">
              <button onClick={() => addNode('approval')} className="btn btn-ghost text-xs">+ 审批</button>
              <button onClick={() => addNode('cc')} className="btn btn-ghost text-xs">+ 抄送</button>
              <button onClick={() => addNode('condition')} className="btn btn-ghost text-xs">+ 条件分支</button>
              <span className="mx-1 h-4 w-px bg-slate-200" />
              <button onClick={tidyLayout} className="btn btn-ghost text-xs">📐 自动整理</button>
            </div>
          </div>
          <div className="border-b border-slate-100 bg-amber-50/60 px-4 py-2 text-[11px] text-amber-900">
            💡 新节点会自动插在"结束"前；如需连线，从节点底部的圆点<strong>拖到</strong>另一个节点顶部的圆点；乱了就点"自动整理"。
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
              defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
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
                    {f.type === 'money' && (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                        <label className="flex items-center gap-1 text-slate-600">
                          默认币种
                          <select
                            value={f.defaultCurrency ?? 'CNY'}
                            onChange={(e) => updateField(f.id, { defaultCurrency: e.target.value as any })}
                            className="rounded bg-white px-1.5 py-0.5 text-[11px] ring-1 ring-slate-200"
                          >
                            <option value="CNY">💴 RMB 人民币</option>
                            <option value="HKD">💶 HKD 港币</option>
                            <option value="USDT">🟢 USDT</option>
                            <option value="USDC">🔵 USDC</option>
                          </select>
                        </label>
                        <label className="flex items-center gap-1 text-slate-600">
                          <input
                            type="checkbox"
                            checked={f.allowCurrencySwitch !== false}
                            onChange={(e) => updateField(f.id, { allowCurrencySwitch: e.target.checked })}
                          />
                          允许提交人切换币种
                        </label>
                      </div>
                    )}
                    {f.type === 'leave_balance' && (
                      <div className="mt-1 rounded bg-indigo-50 px-2 py-1 text-[11px] text-indigo-800 ring-1 ring-indigo-100">
                        ℹ️ 提交人会看到：假期类型（年假/调休/病假/事假/其他）+ 本次申请天数 + 当前剩余天数
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
  const source: 'SPECIFIC' | 'INITIATOR_DEPT_LEAD' | 'DEPT_LEAD' | 'FOUNDER' = d.approverSource ?? 'SPECIFIC';

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
            { v: 'INITIATOR_DEPT_LEAD',   label: '发起人所在部门的负责人（管理层自动升级到总管理者）' },
            { v: 'DEPT_LEAD',             label: '指定部门的负责人' },
            { v: 'FOUNDER',               label: '总管理者（SUPER_ADMIN · 防监守自盗）' },
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

// ---- 字段一键升级工具 ----
// Migrates either the very-old "select 请假类型 + number 请假天数" pattern OR
// the intermediate "leave_balance" bundle to the current split layout: a
// dropdown select for 请假类型 + a dedicated leave_days field. Flow graph is
// untouched; conditions that referenced a deleted field id will surface as
// "该字段已删除" in the condition panel.
function detectLegacyLeaveFields(fields: FormFieldSpec[]): {
  typeId: string | null;
  daysId: string | null;
  bundleId: string | null;
} {
  const typeField = fields.find(
    (f) => f.type === 'select' && (
      (f.options ?? []).includes('年假') ||
      /请假类型|假期类型/.test(f.label)
    )
  );
  const daysField = fields.find(
    (f) => f.type === 'number' && /天数/.test(f.label)
  );
  const bundle = fields.find((f) => f.type === 'leave_balance');
  return {
    typeId: typeField?.id ?? null,
    daysId: daysField?.id ?? null,
    bundleId: bundle?.id ?? null,
  };
}

function upgradeLeaveFields(fields: FormFieldSpec[]): FormFieldSpec[] {
  const { typeId, daysId, bundleId } = detectLegacyLeaveFields(fields);
  const hasNewSplit = fields.some((f) => f.type === 'leave_days')
                    && fields.some((f) => f.type === 'select' && (f.options ?? []).includes('年假'));
  const hasDateRange = fields.some((f) => f.type === 'daterange');
  if (hasNewSplit && hasDateRange && !bundleId) return fields; // already fully migrated
  if (!typeId && !daysId && !bundleId && hasDateRange) return fields;

  const fid = () => `f_${Math.random().toString(36).slice(2, 8)}`;

  const canonicalOptions = ['年假', '调休', '事假', '病假', '婚假', '丧假', '产假', '陪护假'];
  const out: FormFieldSpec[] = [];
  const toDropIds = new Set([bundleId, typeId, daysId].filter((x): x is string => !!x));

  const needNewSplit = !hasNewSplit || !!bundleId;
  const typeReplacement: FormFieldSpec = {
    id: fid(),
    type: 'select',
    label: '请假类型',
    required: true,
    titleField: true,
    options: canonicalOptions,
  };
  const daterangeInjection: FormFieldSpec = {
    id: fid(),
    type: 'daterange',
    label: '请假起止日期',
    required: true,
  };
  const daysReplacement: FormFieldSpec = {
    id: fid(),
    type: 'leave_days',
    label: '请假天数',
    required: true,
  };

  const anchorId = bundleId ?? typeId ?? daysId ?? null;
  let injected = false;
  for (const f of fields) {
    if (anchorId && f.id === anchorId && !injected) {
      if (needNewSplit) out.push(typeReplacement);
      if (!hasDateRange) out.push(daterangeInjection);
      if (needNewSplit) out.push(daysReplacement);
      injected = true;
    } else if (!toDropIds.has(f.id)) {
      out.push(f);
    }
  }
  // If no anchor existed (template was blank of legacy markers yet still
  // missing a daterange), append the injections at the top so the submitter
  // still gets a date to fill in.
  if (!injected) {
    const prepend: FormFieldSpec[] = [];
    if (needNewSplit) prepend.push(typeReplacement);
    if (!hasDateRange) prepend.push(daterangeInjection);
    if (needNewSplit) prepend.push(daysReplacement);
    return [...prepend, ...out];
  }
  return out;
}

function detectMoneyFieldsNeedingCurrency(fields: FormFieldSpec[]): FormFieldSpec[] {
  return fields.filter((f) => f.type === 'money' && (!f.defaultCurrency || f.allowCurrencySwitch === undefined));
}

function upgradeMoneyFields(fields: FormFieldSpec[]): FormFieldSpec[] {
  return fields.map((f) => {
    if (f.type !== 'money') return f;
    if (f.defaultCurrency && f.allowCurrencySwitch !== undefined) return f;
    return {
      ...f,
      defaultCurrency: f.defaultCurrency ?? 'CNY',
      allowCurrencySwitch: f.allowCurrencySwitch ?? true,
    };
  });
}

function LeaveFieldsUpgrader({
  fields,
  expenseCurrencyNeeded,
  onUpgradeLeave,
  onUpgradeMoney,
}: {
  fields: FormFieldSpec[];
  expenseCurrencyNeeded: boolean;
  onUpgradeLeave: () => void;
  onUpgradeMoney: () => void;
}) {
  const leaveLegacy = detectLegacyLeaveFields(fields);
  const hasNewSplit = fields.some((f) => f.type === 'leave_days');
  const hasDateRange = fields.some((f) => f.type === 'daterange');
  const looksLikeLeaveTemplate = hasNewSplit || !!leaveLegacy.bundleId
    || !!(leaveLegacy.typeId || leaveLegacy.daysId);
  // Offer the upgrade when any part of the new structure is missing on a
  // template that's clearly a leave form: legacy bundle, old select+number,
  // or (new split but no daterange to fill in specific dates).
  const hasLegacyLeave = !!leaveLegacy.bundleId
    || (!hasNewSplit && !!(leaveLegacy.typeId || leaveLegacy.daysId))
    || (looksLikeLeaveTemplate && !hasDateRange);
  const moneyNeedsUpgrade = expenseCurrencyNeeded && detectMoneyFieldsNeedingCurrency(fields).length > 0;

  if (!hasLegacyLeave && !moneyNeedsUpgrade) return null;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
      <div className="mb-1.5">
        <span className="font-medium">⚡ 字段升级可用</span>（检测到旧版字段，一键替换为新功能。流程图与其他字段不受影响）
      </div>
      <div className="flex flex-wrap gap-1.5">
        {hasLegacyLeave && (
          <button
            type="button"
            onClick={() => {
              if (!confirm('升级为新版两字段结构：单独下拉"请假类型" + "请假天数"（自动扣余额）。旧字段会被移除，流程图不动。继续？')) return;
              onUpgradeLeave();
            }}
            className="rounded-full bg-white px-2.5 py-0.5 ring-1 ring-amber-300 hover:bg-amber-100"
          >
            🌴 升级为"类型 + 天数"独立字段
          </button>
        )}
        {moneyNeedsUpgrade && (
          <button
            type="button"
            onClick={() => {
              if (!confirm('为当前模板里的金额字段启用多币种（默认 CNY，允许提交人切换 HKD/USDT/USDC）。继续？')) return;
              onUpgradeMoney();
            }}
            className="rounded-full bg-white px-2.5 py-0.5 ring-1 ring-amber-300 hover:bg-amber-100"
          >
            💵 启用金额多币种
          </button>
        )}
      </div>
      <div className="mt-1.5 text-[10px] text-amber-700">⚠️ 升级后记得点顶部的"保存模板"，否则只改在浏览器里不会持久化。</div>
    </div>
  );
}
