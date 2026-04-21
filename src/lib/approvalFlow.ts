// Types + runtime helpers for the approval-flow feature.
// Kept in one file so client and server can share shapes.

export type FieldType =
  | 'text' | 'textarea' | 'number' | 'money' | 'date' | 'datetime' | 'daterange'
  | 'select' | 'multiselect' | 'user' | 'department' | 'attachment'
  | 'leave_balance' | 'leave_days' | 'overtime_hours';

// Conversion constant for overtime → comp leave. Matches the common
// 8-hour workday; kept as a constant so we can surface it in UI copy.
export const OVERTIME_HOURS_PER_COMP_DAY = 8;

export type Currency = 'CNY' | 'HKD' | 'USDT' | 'USDC';

export const CURRENCY_META: Record<Currency, { label: string; symbol: string; icon: string }> = {
  CNY:  { label: 'RMB 人民币',  symbol: '¥',    icon: '💴' },
  HKD:  { label: 'HKD 港币',    symbol: 'HK$',  icon: '💶' },
  USDT: { label: 'USDT',        symbol: '₮',    icon: '🟢' },
  USDC: { label: 'USDC',        symbol: '$',    icon: '🔵' },
};

export const LEAVE_BALANCE_CATEGORIES = [
  '年假', '调休', '事假', '病假', '婚假', '丧假', '产假', '陪护假',
] as const;
export type LeaveBalanceCategory = typeof LEAVE_BALANCE_CATEGORIES[number];

export type FormFieldSpec = {
  id: string;           // stable id inside a template
  type: FieldType;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];   // for select / multiselect
  titleField?: boolean; // if true, this field's value becomes instance title
  // money-only:
  defaultCurrency?: Currency;     // default picked; falls back to CNY
  allowCurrencySwitch?: boolean;  // if true, submitter can change currency; else fixed
};

// Deserialize whatever's in formJson for a money field into a normalised
// { amount, currency } shape. Tolerates legacy number-only values (old
// instances submitted before the currency field existed).
export function parseMoneyValue(v: unknown, fallback: Currency = 'CNY'): { amount: number | null; currency: Currency } {
  if (v == null || v === '') return { amount: null, currency: fallback };
  if (typeof v === 'number') return { amount: v, currency: fallback };
  if (typeof v === 'string') {
    const n = Number(v);
    return { amount: Number.isFinite(n) ? n : null, currency: fallback };
  }
  if (typeof v === 'object') {
    const o = v as any;
    const amt = typeof o.amount === 'number' ? o.amount : (o.amount != null ? Number(o.amount) : null);
    const cur = (o.currency as Currency) ?? fallback;
    return { amount: Number.isFinite(amt) ? amt : null, currency: CURRENCY_META[cur] ? cur : fallback };
  }
  return { amount: null, currency: fallback };
}

// Locate the "请假类型" sibling select in a field list — used by leave_days
// renderers and the balance-effect hook to discover which category the
// submitter picked. Heuristic: any select whose options contain one of the
// canonical leave categories (年假/调休/…) qualifies. Matches templates made
// by the preset AND hand-built ones that happen to use the same vocabulary.
export function findLeaveCategoryField(fields: FormFieldSpec[]): FormFieldSpec | null {
  return fields.find((f) =>
    f.type === 'select' &&
    Array.isArray(f.options) &&
    f.options.some((o) => (LEAVE_BALANCE_CATEGORIES as readonly string[]).includes(o))
  ) ?? null;
}

// Same shape-tolerant parser for leave_balance values.
export function parseLeaveBalanceValue(v: unknown): { category: string; days: number | null; balance: number | null } {
  const empty = { category: '', days: null as number | null, balance: null as number | null };
  if (!v || typeof v !== 'object') return empty;
  const o = v as any;
  const days = o.days != null && o.days !== '' ? Number(o.days) : null;
  const balance = o.balance != null && o.balance !== '' ? Number(o.balance) : null;
  return {
    category: typeof o.category === 'string' ? o.category : '',
    days: Number.isFinite(days) ? days : null,
    balance: Number.isFinite(balance) ? balance : null,
  };
}

export type ApproverSource =
  | 'SPECIFIC'              // explicit list of user ids
  | 'INITIATOR_DEPT_LEAD'   // initiator's department lead(s)
  | 'DEPT_LEAD'             // a specific department's lead
  | 'FOUNDER';              // all active SUPER_ADMIN users — highest integrity anchor
export type ConditionOp = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains';

export type FlowNodeData = {
  label?: string;
  // approval nodes
  approvers?: string[];          // user ids — resolved at submit time
  mode?: 'ALL' | 'ANY';          // 会签 or 或签
  approverSource?: ApproverSource; // how to populate approvers; defaults to SPECIFIC
  sourceDepartmentId?: string;   // for DEPT_LEAD source
  // cc nodes
  ccUsers?: string[];
  // condition nodes
  field?: string;                // form field id to read
  op?: ConditionOp;
  value?: string;                // compared as string / number depending on op
  trueTargetId?: string;         // node id to go to if condition is true
  falseTargetId?: string;        // node id to go to if condition is false
};

export type FlowNode = {
  id: string;
  type: 'start' | 'approval' | 'cc' | 'end' | 'condition';
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
  OVERTIME:    { label: '加班',   icon: '⏱' },
  EXPENSE:     { label: '报销',   icon: '💰' },
  TRAVEL:      { label: '出差',   icon: '✈️' },
  PROCUREMENT: { label: '采购',   icon: '📦' },
  STAMP:       { label: '用章',   icon: '🔖' },
  OTHER:       { label: '其他',   icon: '📋' },
};

export const FIELD_TYPE_META: Record<FieldType, { label: string; icon: string }> = {
  text:          { label: '单行文本',        icon: '📝' },
  textarea:      { label: '多行文本',        icon: '📄' },
  number:        { label: '数字',            icon: '🔢' },
  money:         { label: '金额（多币种）',  icon: '💵' },
  date:          { label: '日期',            icon: '📅' },
  datetime:      { label: '日期 + 时间',     icon: '🕒' },
  daterange:     { label: '日期区间',        icon: '📆' },
  select:        { label: '单选',            icon: '◉' },
  multiselect:   { label: '多选',            icon: '☑' },
  user:          { label: '成员选择',        icon: '👤' },
  department:    { label: '部门选择',        icon: '🏢' },
  attachment:    { label: '附件',            icon: '📎' },
  leave_balance:  { label: '假期余额（旧版合并字段）', icon: '🌴' },
  leave_days:     { label: '请假天数（自动扣余额）',   icon: '📆' },
  overtime_hours: { label: '加班时长（小时）',         icon: '⏱' },
};

// Walk the flow graph forward from `from` (a node id) and return the first
// non-condition downstream node. For condition nodes, call pickBranch with
// form values to resolve which branch to follow.
export function nextNodeId(flow: FlowGraph, fromId: string): string | null {
  const outgoing = flow.edges.filter((e) => e.source === fromId);
  if (outgoing.length === 0) return null;
  return outgoing[0].target;
}

// Evaluate a condition node against form values and return the next node id
// based on trueTargetId / falseTargetId. Falls back to the first outgoing
// edge if the explicit targets are missing (graceful degradation).
export function evaluateCondition(
  node: FlowNode,
  form: Record<string, any>,
  flow: FlowGraph
): string | null {
  const { field, op, value, trueTargetId, falseTargetId } = node.data;
  if (!field || !op) return nextNodeId(flow, node.id);
  let actual = form[field];
  // Normalise structured values so conditions on {amount,currency} money
  // fields and {days,...} leave_balance fields still work.
  if (actual && typeof actual === 'object') {
    if ('amount' in actual) actual = (actual as any).amount;
    else if ('days' in actual) actual = (actual as any).days;
  }
  const expect = value ?? '';
  let pass = false;
  const actualStr = actual === undefined || actual === null ? '' : String(actual);
  const actualNum = Number(actualStr);
  const expectNum = Number(expect);
  switch (op) {
    case '==':       pass = actualStr === expect; break;
    case '!=':       pass = actualStr !== expect; break;
    case '>':        pass = !Number.isNaN(actualNum) && !Number.isNaN(expectNum) && actualNum > expectNum; break;
    case '<':        pass = !Number.isNaN(actualNum) && !Number.isNaN(expectNum) && actualNum < expectNum; break;
    case '>=':       pass = !Number.isNaN(actualNum) && !Number.isNaN(expectNum) && actualNum >= expectNum; break;
    case '<=':       pass = !Number.isNaN(actualNum) && !Number.isNaN(expectNum) && actualNum <= expectNum; break;
    case 'contains': pass = actualStr.includes(expect); break;
  }
  const targetId = pass ? trueTargetId : falseTargetId;
  if (targetId && flow.nodes.some((n) => n.id === targetId)) return targetId;
  // Fallback to first outgoing edge
  return nextNodeId(flow, node.id);
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
