/**
 * 各部门 AI scope 预设清单 —— 给 /admin/api-keys 总管理页 + DeptApiKeysCard 部门内嵌共用。
 *
 * 改动这里需要同时记得：
 * - /api/finance/api-keys POST 后端的 SCOPE_PREFIX_TO_DEPT_SLUG 跟这里 prefix 对齐
 * - lib/dept-access.ts 的部门 slug
 *
 * 命名约定：
 *   <DEPT>_AI:<role>   单一角色 narrow scope
 *   <DEPT>_ADMIN       部门全权（慎发）
 *   <DEPT>_READONLY    部门只读
 */

export type ScopePreset = {
  group: string;
  /** 用于 DeptApiKeysCard scopePrefix 匹配 */
  prefix: string;
  value: string;
  label: string;
  desc: string;
  danger?: boolean;
};

export const SCOPE_PRESETS: ScopePreset[] = [
  // 💰 财务部（仅 SUPER_ADMIN 可发，跨部门 scope）
  { group: '💰 财务部', prefix: 'FINANCE_', value: 'FINANCE_AI:voucher_clerk', label: '凭证编制员', desc: '只能写凭证草稿' },
  { group: '💰 财务部', prefix: 'FINANCE_', value: 'FINANCE_AI:chain_bookkeeper', label: '链上记账员', desc: '只能写链上交易' },
  { group: '💰 财务部', prefix: 'FINANCE_', value: 'FINANCE_AI:forex_lookout', label: '汇率瞭望员', desc: '只能写汇率' },
  { group: '💰 财务部', prefix: 'FINANCE_', value: 'FINANCE_AI:reconciler', label: '对账员', desc: '读链上 + 银行 + 写对账' },
  { group: '💰 财务部', prefix: 'FINANCE_', value: 'FINANCE_AI:cfo', label: 'CFO 财务总监', desc: '全财务读 + 多数写' },
  { group: '💰 财务部', prefix: 'FINANCE_', value: 'FINANCE_ADMIN', label: '👑 财务全权', desc: '全财务读写（慎发）', danger: true },
  { group: '💰 财务部', prefix: 'FINANCE_', value: 'FINANCE_READONLY', label: '财务只读', desc: '看板被动展示用' },

  // 🏢 行政部
  { group: '🏢 行政部', prefix: 'ADMIN_', value: 'ADMIN_AI:license_clerk', label: '证照管家', desc: '写证照 + 到期监控' },
  { group: '🏢 行政部', prefix: 'ADMIN_', value: 'ADMIN_AI:asset_clerk', label: '资产管家', desc: '写固定资产 + 状态' },
  { group: '🏢 行政部', prefix: 'ADMIN_', value: 'ADMIN_AI:facility_clerk', label: '设施管家（v1.1）', desc: '会议室预定 + IT 工单' },
  { group: '🏢 行政部', prefix: 'ADMIN_', value: 'ADMIN_ADMIN', label: '👑 行政全权', desc: '行政部全读写（慎发）', danger: true },
  { group: '🏢 行政部', prefix: 'ADMIN_', value: 'ADMIN_READONLY', label: '行政只读', desc: '看板被动展示用' },

  // ⚖️ LTY 法务
  { group: '⚖️ LTY 法务部', prefix: 'LTY_LEGAL_', value: 'LTY_LEGAL_AI:legal_clerk', label: 'LTY 法务工单', desc: '写 LtyLegalRequest' },
  { group: '⚖️ LTY 法务部', prefix: 'LTY_LEGAL_', value: 'LTY_LEGAL_AI:assistant', label: 'LTY 法务助手（v1.1）', desc: 'AI 问答 + 服务目录' },
  { group: '⚖️ LTY 法务部', prefix: 'LTY_LEGAL_', value: 'LTY_LEGAL_ADMIN', label: '👑 LTY 法务全权', desc: 'LTY 法务全读写（慎发）', danger: true },
  { group: '⚖️ LTY 法务部', prefix: 'LTY_LEGAL_', value: 'LTY_LEGAL_READONLY', label: 'LTY 法务只读', desc: '看板被动展示用' },

  // 🔒 MC 法务（隔离）
  { group: '🔒 MC 法务部（隔离）', prefix: 'MC_LEGAL_', value: 'MC_LEGAL_AI:legal_clerk', label: 'MC 法务工单', desc: '写 McLegalRequest（与 LTY 隔离）' },
  { group: '🔒 MC 法务部（隔离）', prefix: 'MC_LEGAL_', value: 'MC_LEGAL_AI:assistant', label: 'MC 法务助手（v1.1）', desc: '独立 MC Coze workspace' },
  { group: '🔒 MC 法务部（隔离）', prefix: 'MC_LEGAL_', value: 'MC_LEGAL_ADMIN', label: '👑 MC 法务全权', desc: 'MC 法务全读写（慎发，红线）', danger: true },
  { group: '🔒 MC 法务部（隔离）', prefix: 'MC_LEGAL_', value: 'MC_LEGAL_READONLY', label: 'MC 法务只读', desc: '看板被动展示用' },

  // 👥 HR
  { group: '👥 人事部', prefix: 'HR_', value: 'HR_AI:hr_clerk', label: '人事管家', desc: '写候选人 / 员工档案 / 试用期监控' },
  { group: '👥 人事部', prefix: 'HR_', value: 'HR_ADMIN', label: '👑 人事全权', desc: '人事部全读写（慎发）', danger: true },
  { group: '👥 人事部', prefix: 'HR_', value: 'HR_READONLY', label: '人事只读', desc: '看板被动展示用' },

  // 💼 财务出纳
  { group: '💼 财务出纳', prefix: 'CASHIER_', value: 'CASHIER_AI:cashier_clerk', label: '出纳助手', desc: '快速录入 / 报销 / 对账（v1.1 接入后可写）' },
  { group: '💼 财务出纳', prefix: 'CASHIER_', value: 'CASHIER_ADMIN', label: '👑 出纳全权', desc: '出纳全读写（慎发）', danger: true },
  { group: '💼 财务出纳', prefix: 'CASHIER_', value: 'CASHIER_READONLY', label: '出纳只读', desc: '看板被动展示用' },
];

/** 按 prefix 过滤本部门可选 scope */
export function getScopeChoices(prefix: string): ScopePreset[] {
  return SCOPE_PRESETS.filter((p) => p.prefix === prefix);
}
