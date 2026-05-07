/**
 * 出纳部共享枚举 + label
 *
 * ⭐ dualLayer 字段（合规台账）：
 *    REAL = 真实业务（链上 USDT 流水进真实账，AI 默认）
 *    COMPLIANCE = 合规外壳（书面合同 / 对监管 / 不入真实账）
 *    BOTH = 同一笔双账都进
 */

export const CASHIER_REIMB_CATEGORY_LABEL: Record<string, string> = {
  TRAVEL: '差旅费',
  MEAL: '餐饮费',
  OFFICE: '办公费',
  TRAINING: '培训费',
  OTHER: '其他',
};

export const CASHIER_REIMB_STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING: { label: '待审批', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  APPROVED: { label: '已批准', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  REJECTED: { label: '已拒绝', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  PAID: { label: '已付款', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  CANCELLED: { label: '已取消', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

export const CASHIER_RECON_TYPE_LABEL: Record<string, string> = {
  AD_CHANNEL: '投放渠道对账',
  AGENT_REBATE: '代理返佣对账',
  PLATFORM_FEE: '平台手续费对账',
  PAYROLL_SOCIAL: '工资及社保对账',
  BANK_DEPOSIT: '银行存款对账',
  TAX_FILING: '税务申报对账',
  OTHER: '其他对账',
};

export const CASHIER_RECON_STATUS_META: Record<string, { label: string; cls: string }> = {
  OPEN: { label: '待完成', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
  IN_PROGRESS: { label: '进行中', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  WARNING: { label: '预警', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  DONE: { label: '已完成', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
};

export const CASHIER_CYCLE_LABEL: Record<string, string> = {
  WEEKLY: '周度',
  MONTHLY: '月度',
  QUARTERLY: '季度',
  ANNUAL: '年度',
  ADHOC: '临时',
};

export const CASHIER_COMPLIANCE_CATEGORY_LABEL: Record<string, string> = {
  TAX: '税务申报',
  LICENSE: '证照管理',
  BANK_ACCOUNT: '银行账户',
  EXCHANGE_ACCOUNT: '交易所账户',
  FIXED_ASSET: '固定资产',
};

export const CASHIER_COMPLIANCE_STATUS_META: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: '在用', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  EXPIRING: { label: '即将到期', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  EXPIRED: { label: '已过期', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  ARCHIVED: { label: '已归档', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

/** ⭐ 双层结构 label —— 老板手动切，AI 默认 REAL */
export const CASHIER_DUAL_LAYER_META: Record<string, { label: string; cls: string; hint: string }> = {
  REAL: {
    label: '真实',
    cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    hint: '真实业务 · 链上 USDT 流水进真实账',
  },
  COMPLIANCE: {
    label: '合规外壳',
    cls: 'bg-violet-50 text-violet-700 ring-violet-200',
    hint: '书面合同 / 对监管 / 不入真实账',
  },
  BOTH: {
    label: '双层',
    cls: 'bg-amber-50 text-amber-800 ring-amber-200',
    hint: '真实 + 合规两本账都进',
  },
};

export function daysUntil(d: Date | null | undefined): number | null {
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

export function formatMoney(amount: { toString(): string } | null | undefined): string {
  if (amount == null) return '—';
  return Number(amount.toString()).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
