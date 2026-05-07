/**
 * 双法务部共享类型 / 元数据 —— UI 组件用 plain 类型（不耦合 prisma model），
 * page 把 LtyLegalRequest / McLegalRequest 各自查询后 map 成 LegalRequestRow。
 *
 * 物理隔离：同一份 schema/UI，但数据/查询/API 都按 dept 分流。MC Markets
 * 数据红线（feedback_lty_legal_dual_layer.md）—— 共享代码、不共享数据。
 */

export type LegalDeptKind = 'lty' | 'mc';

export const LEGAL_DEPT_META: Record<LegalDeptKind, {
  slug: string;
  title: string;
  shortName: string;
  description: string;
  accent: 'sky' | 'purple';
}> = {
  lty: {
    slug: 'lty-legal',
    title: 'LTY 法务部',
    shortName: 'LTY 法务',
    description: '合同审 / 知识产权 / 合规 / 争议（自家业务）',
    accent: 'sky',
  },
  mc: {
    slug: 'mc-legal',
    title: 'MC 法务部',
    shortName: 'MC 法务',
    description: 'MC Markets 外包业务（数据物理隔离）',
    accent: 'purple',
  },
};

export const LEGAL_CATEGORY_LABEL: Record<string, string> = {
  CONTRACT_REVIEW: '合同审核',
  IP: '知识产权',
  COMPLIANCE: '合规',
  DISPUTE: '争议处理',
  OTHER: '其它',
};

export const LEGAL_CATEGORY_OPTIONS = [
  { value: 'CONTRACT_REVIEW', label: '合同审核' },
  { value: 'IP', label: '知识产权' },
  { value: 'COMPLIANCE', label: '合规' },
  { value: 'DISPUTE', label: '争议处理' },
  { value: 'OTHER', label: '其它' },
];

export const LEGAL_PRIORITY_OPTIONS = [
  { value: 'LOW', label: '低' },
  { value: 'NORMAL', label: '普通' },
  { value: 'HIGH', label: '高' },
  { value: 'URGENT', label: '紧急' },
];

export const LEGAL_PRIORITY_META: Record<string, { label: string; cls: string; dot: string }> = {
  LOW: { label: '低', cls: 'bg-slate-50 text-slate-600 ring-slate-200', dot: 'bg-slate-400' },
  NORMAL: { label: '普通', cls: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500' },
  HIGH: { label: '高', cls: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500' },
  URGENT: { label: '紧急', cls: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500' },
};

export const LEGAL_STATUS_META: Record<string, { label: string; cls: string }> = {
  OPEN: { label: '待处理', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  IN_PROGRESS: { label: '进行中', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  RESOLVED: { label: '已完成', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  CANCELLED: { label: '已取消', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

/** UI 组件用的扁平 row 类型 —— 不依赖 prisma 任何 model */
export type LegalRequestRow = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: string;
  status: string;
  requester: { id: string; name: string | null; email: string } | null;
  assignee: { id: string; name: string | null; email: string } | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  notes: string | null;
  vaultPath: string | null;
  createdByAi: string | null;
  createdAt: Date;
  updatedAt: Date;
};
