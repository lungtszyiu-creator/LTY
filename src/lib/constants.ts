// Concurrent tasks a member may hold in CLAIMED status at once.
// Munger-style anti-gaming: stop claim-hoarders.
export const MAX_CONCURRENT_CLAIMS = 3;

export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export const PRIORITY_META: Record<Priority, { label: string; dot: string; ring: string; text: string; bg: string; pointsHint: string }> = {
  LOW:     { label: '低',    dot: 'bg-slate-400',  ring: 'ring-slate-200',   text: 'text-slate-600',  bg: 'bg-slate-50',  pointsHint: '5' },
  NORMAL:  { label: '普通',  dot: 'bg-sky-500',    ring: 'ring-sky-200',     text: 'text-sky-700',    bg: 'bg-sky-50',    pointsHint: '10' },
  HIGH:    { label: '重要',  dot: 'bg-amber-500',  ring: 'ring-amber-200',   text: 'text-amber-800',  bg: 'bg-amber-50',  pointsHint: '20' },
  URGENT:  { label: '紧急',  dot: 'bg-rose-500',   ring: 'ring-rose-300',    text: 'text-rose-700',   bg: 'bg-rose-50',   pointsHint: '35' },
};

// Contribution type — which category of EXTRA work this task belongs to.
// Anchored in handbook § 2.5.1: "重点事项、专项项目、跨部门协作、流程优化、
// 技术升级、合规建设、业务增长及组织改善"
export type Contribution = 'CROSS_TEAM' | 'PROCESS' | 'KNOWLEDGE' | 'FIREFIGHT' | 'EXTERNAL' | 'GROWTH' | 'OTHER';

export const CONTRIBUTION_META: Record<Contribution, { label: string; icon: string; text: string; bg: string; ring: string; desc: string }> = {
  CROSS_TEAM: { label: '跨部门协作', icon: '🤝', text: 'text-indigo-700',   bg: 'bg-indigo-50',   ring: 'ring-indigo-200',   desc: '不属于任何单一岗位、需要多方协同完成' },
  PROCESS:    { label: '流程优化',   icon: '⚙️', text: 'text-teal-700',     bg: 'bg-teal-50',     ring: 'ring-teal-200',     desc: '发现并修复流程痛点 · 改善效率或合规' },
  KNOWLEDGE:  { label: '知识沉淀',   icon: '📚', text: 'text-violet-700',   bg: 'bg-violet-50',   ring: 'ring-violet-200',   desc: '写文档 / SOP / 培训新人 · 把个人经验留给公司' },
  FIREFIGHT:  { label: '救火应急',   icon: '🚨', text: 'text-rose-700',     bg: 'bg-rose-50',     ring: 'ring-rose-200',     desc: '突发问题 / 客户投诉 · 超出日常分工之外的处置' },
  EXTERNAL:   { label: '对外代表',   icon: '🎤', text: 'text-amber-800',    bg: 'bg-amber-50',    ring: 'ring-amber-200',    desc: '对外分享 / 招聘代言 / 行业发声 · 代表公司出面' },
  GROWTH:     { label: '业务增长',   icon: '📈', text: 'text-emerald-700',  bg: 'bg-emerald-50',  ring: 'ring-emerald-200',  desc: '带来新用户 / 新营收 / 新合作 · 且不在本职 KPI 范围内' },
  OTHER:      { label: '其他专项',   icon: '🧩', text: 'text-slate-700',    bg: 'bg-slate-50',    ring: 'ring-slate-200',    desc: '其他额外项目 · 需在任务说明中写清为什么这不属于任何岗位的本职' },
};

// Heuristic keywords that suggest a task MIGHT be a core duty disguised as a task pool item.
// When the admin's title/description matches these, we show a gentle warning.
export const CORE_DUTY_WARNING_KEYWORDS = [
  '周报', '月报', '日报', '晨会', '周会',
  '本职', '岗位说明书', 'KPI', 'OKR',
  '例行', '日常', '常规', '本分',
];

export const POSITION_LEVEL_META = {
  EXECUTIVE: { label: '高层决策', ring: 'ring-rose-200',  bg: 'bg-rose-50',  text: 'text-rose-700' },
  MANAGER:   { label: '中高层管理', ring: 'ring-amber-200', bg: 'bg-amber-50', text: 'text-amber-800' },
  STAFF:     { label: '职员', ring: 'ring-sky-200',   bg: 'bg-sky-50',   text: 'text-sky-700' },
} as const;

export type PositionLevel = keyof typeof POSITION_LEVEL_META;

export const FAQ_CATEGORY_META = {
  TASK_POOL: { label: '任务池规则' },
  COMP:      { label: '薪酬结构' },
  PROCESS:   { label: '日常工作' },
  OTHER:     { label: '其他' },
} as const;

export type FAQCategory = keyof typeof FAQ_CATEGORY_META;
