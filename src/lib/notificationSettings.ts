import { prisma } from './db';

// Canonical list of notification kinds + their human labels + the default
// audience rule as documented. Used to render the settings page and to look
// up per-kind config when the email layer sends.
export const NOTIFICATION_KINDS = [
  { kind: 'TASK_PUBLISHED',     label: '📢 任务发布',    defaultAudience: '全员（MEMBER + ADMIN）' },
  { kind: 'SUBMISSION',         label: '🔔 任务提交待审', defaultAudience: '所有管理员' },
  { kind: 'SUBMISSION_REVIEWED',label: '✅❌ 任务审核结果', defaultAudience: '提交人' },
  { kind: 'REWARD_STATUS',      label: '🎁 奖励状态变更', defaultAudience: '收款人' },
  { kind: 'PENALTY_ISSUED',     label: '⚠️ 扣罚记录',    defaultAudience: '被扣罚人' },
  { kind: 'ANNOUNCEMENT',       label: '📢 公司公告',    defaultAudience: '全员' },
  { kind: 'APPROVAL_PENDING',   label: '⏰ 审批待处理',   defaultAudience: '当前审批人' },
  { kind: 'APPROVAL_FINALISED', label: '🏁 审批最终结果', defaultAudience: '发起人' },
  { kind: 'REPORT_SUBMITTED',   label: '📝 汇报提交',    defaultAudience: '汇报对象' },
] as const;

export type NotificationKind = typeof NOTIFICATION_KINDS[number]['kind'];

export type ResolvedNotificationSetting = {
  enabled: boolean;
  extraUserIds: string[];
};

// Look up a kind's setting; if there's no row yet, return defaults (enabled,
// no extras). Safe to call from anywhere.
export async function getNotificationSetting(kind: string): Promise<ResolvedNotificationSetting> {
  const row = await prisma.notificationSetting.findUnique({ where: { kind } });
  if (!row) return { enabled: true, extraUserIds: [] };
  let extras: string[] = [];
  try { extras = JSON.parse(row.extraUserIds || '[]'); if (!Array.isArray(extras)) extras = []; } catch { extras = []; }
  return { enabled: row.enabled, extraUserIds: extras };
}

// Given a base recipient list (emails) and the notification kind, look up the
// setting and return the final recipients — adding extras, or empty if kind
// is disabled. Used by notify* helpers in lib/email.ts.
export async function applyNotificationSetting(
  kind: string,
  baseEmails: string[]
): Promise<{ emails: string[]; enabled: boolean }> {
  const setting = await getNotificationSetting(kind);
  if (!setting.enabled) return { emails: [], enabled: false };
  if (setting.extraUserIds.length === 0) return { emails: baseEmails, enabled: true };
  const extras = await prisma.user.findMany({
    where: { id: { in: setting.extraUserIds }, active: true },
    select: { email: true },
  });
  const merged = Array.from(new Set([...baseEmails, ...extras.map((u) => u.email).filter((e): e is string => !!e)]));
  return { emails: merged, enabled: true };
}
