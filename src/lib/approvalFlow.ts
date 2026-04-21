// Types + runtime helpers for the approval-flow feature.
// Kept in one file so client and server can share shapes.

export type FieldType =
  | 'text' | 'textarea' | 'number' | 'money' | 'date' | 'daterange'
  | 'select' | 'multiselect' | 'user' | 'department' | 'attachment';

export type FormFieldSpec = {
  id: string;           // stable id inside a template
  type: FieldType;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];   // for select / multiselect
  titleField?: boolean; // if true, this field's value becomes instance title
};

export type FlowNodeData = {
  label?: string;
  // approval nodes
  approvers?: string[];   // user ids
  mode?: 'ALL' | 'ANY';   // 会签 or 或签
  // cc nodes
  ccUsers?: string[];
};

export type FlowNode = {
  id: string;
  type: 'start' | 'approval' | 'cc' | 'end';
  position: { x: number; y: number };
  data: FlowNodeData;
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
};

export type FlowGraph = {
  nodes: FlowNode[];
  edges: FlowEdge[];
};

export const APPROVAL_CATEGORY_META: Record<string, { label: string; icon: string }> = {
  LEAVE:       { label: '请假',   icon: '🌴' },
  EXPENSE:     { label: '报销',   icon: '💰' },
  TRAVEL:      { label: '出差',   icon: '✈️' },
  PROCUREMENT: { label: '采购',   icon: '📦' },
  STAMP:       { label: '用章',   icon: '🔖' },
  OTHER:       { label: '其他',   icon: '📋' },
};

export const FIELD_TYPE_META: Record<FieldType, { label: string; icon: string }> = {
  text:        { label: '单行文本',  icon: '📝' },
  textarea:    { label: '多行文本',  icon: '📄' },
  number:      { label: '数字',      icon: '🔢' },
  money:       { label: '金额',      icon: '💵' },
  date:        { label: '日期',      icon: '📅' },
  daterange:   { label: '日期区间',  icon: '📆' },
  select:      { label: '单选',      icon: '◉' },
  multiselect: { label: '多选',      icon: '☑' },
  user:        { label: '成员选择',  icon: '👤' },
  department:  { label: '部门选择',  icon: '🏢' },
  attachment:  { label: '附件',      icon: '📎' },
};

// Walk the flow graph forward from `from` (a node id) and return the first
// approval/cc/end node following the edges. Doesn't recurse into branches
// — v1 flows are effectively linear (no condition nodes yet).
export function nextNodeId(flow: FlowGraph, fromId: string): string | null {
  const outgoing = flow.edges.filter((e) => e.source === fromId);
  if (outgoing.length === 0) return null;
  return outgoing[0].target; // v1: single outgoing edge
}

// Starting point — the "start" node.
export function findStartNode(flow: FlowGraph): FlowNode | null {
  return flow.nodes.find((n) => n.type === 'start') ?? null;
}

export function findNodeById(flow: FlowGraph, id: string): FlowNode | null {
  return flow.nodes.find((n) => n.id === id) ?? null;
}

// Produce an initial blank template flow (start → one approval → end).
export function blankFlow(): FlowGraph {
  return {
    nodes: [
      { id: 'start', type: 'start', position: { x: 200, y: 60 }, data: { label: '发起人' } },
      { id: 'a1',    type: 'approval', position: { x: 200, y: 220 }, data: { label: '审批人', approvers: [], mode: 'ALL' } },
      { id: 'end',   type: 'end',   position: { x: 200, y: 380 }, data: { label: '结束' } },
    ],
    edges: [
      { id: 'e-start-a1', source: 'start', target: 'a1' },
      { id: 'e-a1-end',   source: 'a1',    target: 'end' },
    ],
  };
}

export function parseFlow(s: string): FlowGraph {
  try {
    const j = JSON.parse(s);
    if (!j || !Array.isArray(j.nodes) || !Array.isArray(j.edges)) return blankFlow();
    return j;
  } catch {
    return blankFlow();
  }
}

export function parseFields(s: string): FormFieldSpec[] {
  try {
    const j = JSON.parse(s);
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}
