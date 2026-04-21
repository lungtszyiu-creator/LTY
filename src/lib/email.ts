import nodemailer, { type Transporter } from 'nodemailer';
import { prisma } from './db';

const GMAIL_USER = process.env.GMAIL_USER;
// Gmail displays app passwords with spaces; strip them.
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');
const APP_URL = (process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '');

let cached: Transporter | null = null;
function getTransporter() {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return null;
  if (cached) return cached;
  cached = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  return cached;
}

export function emailConfigured() {
  return Boolean(GMAIL_USER && GMAIL_APP_PASSWORD);
}

type SendArgs = { to: string[]; subject: string; html: string };

// Core transport — does not log. Retries up to 3 times with backoff.
// Returns { ok, attempts, error? } so the caller can persist an audit log.
async function sendWithRetry({ to, subject, html }: SendArgs): Promise<{ ok: boolean; attempts: number; error?: string; reason?: 'NOT_CONFIGURED' | 'NO_RECIPIENTS' | 'SMTP_FAILED' }> {
  const t = getTransporter();
  if (!t) {
    console.error('[email] NOT CONFIGURED — GMAIL_USER / GMAIL_APP_PASSWORD missing. Notification skipped.');
    return { ok: false, attempts: 0, error: 'GMAIL env vars not set', reason: 'NOT_CONFIGURED' };
  }
  const unique = Array.from(new Set(to.filter(Boolean)));
  if (unique.length === 0) return { ok: true, attempts: 0, reason: 'NO_RECIPIENTS' };

  const backoffMs = [1000, 5000, 30000];
  let lastErr: unknown = null;
  for (let i = 0; i < backoffMs.length; i++) {
    try {
      await t.sendMail({
        from: `"LTY 旭珑 · 任务池" <${GMAIL_USER}>`,
        to: GMAIL_USER,        // send to self to satisfy SMTP "to" requirement
        bcc: unique,           // real recipients hidden from each other
        subject,
        html,
      });
      return { ok: true, attempts: i + 1 };
    } catch (e) {
      lastErr = e;
      console.error(`[email] attempt ${i + 1}/${backoffMs.length} failed:`, (e as Error)?.message ?? e);
      if (i < backoffMs.length - 1) {
        await new Promise((r) => setTimeout(r, backoffMs[i]));
      }
    }
  }
  return {
    ok: false,
    attempts: backoffMs.length,
    error: (lastErr as Error)?.message ?? String(lastErr),
    reason: 'SMTP_FAILED',
  };
}

type LogArgs = { kind: string; taskId?: string | null; subject: string; recipients: number };
async function logNotification(args: LogArgs, result: Awaited<ReturnType<typeof sendWithRetry>>) {
  try {
    await prisma.notificationLog.create({
      data: {
        kind: args.kind,
        taskId: args.taskId ?? null,
        subject: args.subject,
        recipients: args.recipients,
        status: result.ok ? 'SENT' : (result.reason === 'NOT_CONFIGURED' ? 'NOT_CONFIGURED' : 'FAILED'),
        attempts: result.attempts,
        error: result.error ?? null,
      },
    });
  } catch (e) {
    // Last-resort: we could not even write the audit row. Log very loudly.
    console.error('[email] CRITICAL: failed to write NotificationLog', e);
  }
}

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function wrap(inner: string) {
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;background:#fff;">${inner}<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"><p style="font-size:12px;color:#64748b;">LTY 旭珑 · 任务池系统邮件 · <a href="${APP_URL}" style="color:#475569;">${APP_URL}</a></p></div>`;
}

function buildTaskPublishedEmail(task: {
  id: string; title: string; description: string; reward: string | null; deadline: Date | null; allowMultiClaim?: boolean;
}) {
  const link = `${APP_URL}/tasks/${task.id}`;
  const descPreview = task.description.length > 300 ? task.description.slice(0, 300) + '…' : task.description;
  const modeBadge = task.allowMultiClaim
    ? '<span style="display:inline-block;background:#eef2ff;color:#4338ca;padding:2px 10px;border-radius:999px;font-size:12px;margin-left:6px;">多人共享 · 验收选优</span>'
    : '<span style="display:inline-block;background:#f1f5f9;color:#475569;padding:2px 10px;border-radius:999px;font-size:12px;margin-left:6px;">独占任务 · 先到先得</span>';
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:18px;">📢 新任务：${esc(task.title)}${modeBadge}</h2>
    <p style="color:#475569;margin:0 0 16px;">有新任务发布，欢迎领取。</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:16px;white-space:pre-wrap;font-size:14px;">${esc(descPreview)}</div>
    ${task.reward ? `<p style="margin:8px 0;"><strong>奖励：</strong>${esc(task.reward)}</p>` : ''}
    ${task.deadline ? `<p style="margin:8px 0;"><strong>截止：</strong>${esc(new Date(task.deadline).toLocaleString('zh-CN'))}</p>` : ''}
    <p style="margin:24px 0 8px;"><a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500;">查看并领取 →</a></p>
  `);
  return { subject: `[LTY · 任务池] 新任务：${task.title}`, html };
}

export async function notifyTaskPublished(task: {
  id: string; title: string; description: string; reward: string | null; deadline: Date | null; allowMultiClaim?: boolean;
}) {
  const members = await prisma.user.findMany({
    where: { role: { in: ['MEMBER', 'ADMIN'] }, active: true },
    select: { email: true },
  });
  const emails = members.map((m) => m.email).filter((e): e is string => !!e);
  const { subject, html } = buildTaskPublishedEmail(task);
  const result = await sendWithRetry({ to: emails, subject, html });
  await logNotification({ kind: 'TASK_PUBLISHED', taskId: task.id, subject, recipients: emails.length }, result);
  return result;
}

export async function notifySubmission(args: {
  taskId: string; taskTitle: string; submitterName: string; submitterEmail: string; note: string;
}) {
  const admins = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, active: true },
    select: { email: true },
  });
  const emails = admins.map((a) => a.email).filter((e): e is string => !!e);

  const link = `${APP_URL}/tasks/${args.taskId}`;
  const notePreview = args.note.length > 400 ? args.note.slice(0, 400) + '…' : args.note;
  const subject = `[LTY · 任务池] 待审核：${args.taskTitle}`;
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:18px;">🔔 收到新提交</h2>
    <p style="color:#475569;margin:0 0 16px;"><strong>${esc(args.submitterName || args.submitterEmail)}</strong> 提交了任务《${esc(args.taskTitle)}》，等待审核。</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:16px;white-space:pre-wrap;font-size:14px;">${esc(notePreview)}</div>
    <p style="margin:24px 0 8px;"><a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500;">前往审核 →</a></p>
  `);
  const result = await sendWithRetry({ to: emails, subject, html });
  await logNotification({ kind: 'SUBMISSION', taskId: args.taskId, subject, recipients: emails.length }, result);
  return result;
}

// Admin-triggered re-send after a failure. Loads the task fresh and uses the
// same template as the original notification.
export async function resendTaskPublished(taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error('TASK_NOT_FOUND');
  return notifyTaskPublished(task);
}

// Notify the submitter when their submission is APPROVED or REJECTED. Closes
// the loop so members don't have to refresh the task page to find out what
// happened.
export async function notifySubmissionReviewed(args: {
  taskId: string;
  taskTitle: string;
  recipientEmail: string;
  decision: 'APPROVED' | 'REJECTED';
  reviewerName: string;
  note: string | null;
}) {
  if (!args.recipientEmail) return { ok: true, attempts: 0 };
  const link = `${APP_URL}/tasks/${args.taskId}`;
  const isApproved = args.decision === 'APPROVED';
  const subject = isApproved
    ? `[LTY · 任务池] ✅ 已通过：${args.taskTitle}`
    : `[LTY · 任务池] ❌ 已驳回：${args.taskTitle}`;
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:18px;">${isApproved ? '✅ 你的提交已通过' : '❌ 你的提交被驳回'}</h2>
    <p style="color:#475569;margin:0 0 16px;">任务《${esc(args.taskTitle)}》的审核结果出来了。</p>
    <div style="background:${isApproved ? '#ecfdf5' : '#fef2f2'};border:1px solid ${isApproved ? '#a7f3d0' : '#fecaca'};border-radius:8px;padding:14px 16px;margin-bottom:16px;">
      <p style="margin:0;color:${isApproved ? '#065f46' : '#991b1b'};font-weight:600;">
        ${isApproved ? '通过' : '驳回'} · 审核人 ${esc(args.reviewerName)}
      </p>
      ${args.note ? `<p style="margin:8px 0 0;color:#334155;white-space:pre-wrap;">${esc(args.note)}</p>` : ''}
    </div>
    ${isApproved ? '<p style="margin:8px 0;color:#475569;">奖励会自动进入"待发放"列表，发放后会再次通知你。</p>' : ''}
    <p style="margin:24px 0 8px;"><a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500;">查看详情 →</a></p>
  `);
  const result = await sendWithRetry({ to: [args.recipientEmail], subject, html });
  await logNotification({ kind: 'SUBMISSION_REVIEWED', taskId: args.taskId, subject, recipients: 1 }, result);
  return result;
}

export async function notifyRewardStatusChanged(args: {
  taskId: string;
  taskTitle: string;
  recipientEmail: string;
  status: 'ISSUED' | 'CANCELLED' | 'DISPUTED';
  rewardText: string | null;
  points: number;
  actorName: string;
  reason?: string | null;
}) {
  if (!args.recipientEmail) return { ok: true, attempts: 0 };
  const link = `${APP_URL}/rewards`;
  const title =
    args.status === 'ISSUED'    ? '🎁 奖励已发放' :
    args.status === 'CANCELLED' ? '🚫 奖励被驳回 / 取消' :
                                   '⚠️ 奖励被标记异议';
  const subject = `[LTY · 任务池] ${title}：${args.taskTitle}`;
  const bg =
    args.status === 'ISSUED'    ? { box: '#eef2ff', border: '#c7d2fe', fg: '#3730a3' } :
    args.status === 'CANCELLED' ? { box: '#fef2f2', border: '#fecaca', fg: '#991b1b' } :
                                   { box: '#fffbeb', border: '#fde68a', fg: '#92400e' };
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:18px;">${title}</h2>
    <p style="color:#475569;margin:0 0 16px;">任务《${esc(args.taskTitle)}》的奖励状态更新。</p>
    <div style="background:${bg.box};border:1px solid ${bg.border};border-radius:8px;padding:14px 16px;margin-bottom:16px;">
      <p style="margin:0;color:${bg.fg};font-weight:600;">操作人：${esc(args.actorName)}</p>
      ${args.rewardText ? `<p style="margin:6px 0 0;color:#334155;">🎁 ${esc(args.rewardText)}</p>` : ''}
      ${args.points > 0 ? `<p style="margin:6px 0 0;color:#334155;">${args.points} 积分</p>` : ''}
      ${args.reason ? `<p style="margin:10px 0 0;color:#334155;white-space:pre-wrap;"><strong>说明：</strong>${esc(args.reason)}</p>` : ''}
    </div>
    ${args.status === 'ISSUED' ? '<p style="margin:8px 0;color:#475569;">请在"我的奖励"页面点"已收到"确认回执。</p>' : ''}
    <p style="margin:24px 0 8px;"><a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500;">前往"我的奖励" →</a></p>
  `);
  const result = await sendWithRetry({ to: [args.recipientEmail], subject, html });
  await logNotification({ kind: 'REWARD_STATUS', taskId: args.taskId, subject, recipients: 1 }, result);
  return result;
}

export async function notifyApprovalPending(args: {
  approverEmail: string;
  approverName: string;
  instanceId: string;
  instanceTitle: string;
  templateName: string;
  initiatorName: string;
}) {
  if (!args.approverEmail) return { ok: true, attempts: 0 };
  const link = `${APP_URL}/approvals/${args.instanceId}`;
  const subject = `[LTY · 审批] ⏰ 待你审批：${args.instanceTitle}`;
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:18px;">⏰ 待你审批</h2>
    <p style="color:#475569;margin:0 0 16px;">${esc(args.approverName)}，有一条审批等你处理：</p>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin-bottom:16px;">
      <p style="margin:0;color:#1e3a8a;font-weight:600;">${esc(args.instanceTitle)}</p>
      <p style="margin:6px 0 0;color:#334155;">模板：${esc(args.templateName)}</p>
      <p style="margin:6px 0 0;color:#334155;">发起人：${esc(args.initiatorName)}</p>
    </div>
    <p style="margin:24px 0 8px;"><a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500;">前往处理 →</a></p>
  `);
  const result = await sendWithRetry({ to: [args.approverEmail], subject, html });
  await logNotification({ kind: 'APPROVAL_PENDING', taskId: null, subject, recipients: 1 }, result);
  return result;
}

export async function notifyApprovalFinalised(args: {
  initiatorEmail: string;
  initiatorName: string;
  instanceId: string;
  instanceTitle: string;
  templateName: string;
  outcome: 'APPROVED' | 'REJECTED' | 'CANCELLED';
  lastActorName?: string;
  lastNote?: string | null;
}) {
  if (!args.initiatorEmail) return { ok: true, attempts: 0 };
  const link = `${APP_URL}/approvals/${args.instanceId}`;
  const isOk = args.outcome === 'APPROVED';
  const title = isOk ? '✅ 审批已通过' : args.outcome === 'REJECTED' ? '❌ 审批被驳回' : '📤 审批已撤销';
  const subject = `[LTY · 审批] ${title}：${args.instanceTitle}`;
  const bg = isOk ? { box: '#ecfdf5', border: '#a7f3d0', fg: '#065f46' } : args.outcome === 'REJECTED' ? { box: '#fef2f2', border: '#fecaca', fg: '#991b1b' } : { box: '#f8fafc', border: '#e2e8f0', fg: '#475569' };
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:18px;">${title}</h2>
    <p style="color:#475569;margin:0 0 16px;">${esc(args.initiatorName)}，你发起的审批有了结果：</p>
    <div style="background:${bg.box};border:1px solid ${bg.border};border-radius:8px;padding:14px 16px;margin-bottom:16px;">
      <p style="margin:0;color:${bg.fg};font-weight:600;">${esc(args.instanceTitle)}</p>
      <p style="margin:6px 0 0;color:#334155;">模板：${esc(args.templateName)}</p>
      ${args.lastActorName ? `<p style="margin:6px 0 0;color:#334155;">决定人：${esc(args.lastActorName)}</p>` : ''}
      ${args.lastNote ? `<p style="margin:10px 0 0;color:#334155;white-space:pre-wrap;"><strong>说明：</strong>${esc(args.lastNote)}</p>` : ''}
    </div>
    <p style="margin:24px 0 8px;"><a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500;">查看详情 →</a></p>
  `);
  const result = await sendWithRetry({ to: [args.initiatorEmail], subject, html });
  await logNotification({ kind: 'APPROVAL_FINALISED', taskId: null, subject, recipients: 1 }, result);
  return result;
}

export async function notifyPenaltyIssued(args: {
  recipientEmail: string;
  userName: string;
  issuerName: string;
  points: number;
  reason: string;
  taskId?: string | null;
  taskTitle?: string | null;
}) {
  if (!args.recipientEmail) return { ok: true, attempts: 0 };
  const subject = `[LTY · 任务池] ⚠️ 不良记录：扣 ${args.points} 积分`;
  const link = args.taskId ? `${APP_URL}/tasks/${args.taskId}` : `${APP_URL}/dashboard`;
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:18px;">⚠️ 你收到一条不良记录</h2>
    <p style="color:#475569;margin:0 0 16px;">${esc(args.userName)}，你好。以下事项已被记录到你的档案：</p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin-bottom:16px;">
      <p style="margin:0;color:#991b1b;font-weight:600;">扣罚 ${args.points} 积分 · 登记人 ${esc(args.issuerName)}</p>
      ${args.taskTitle ? `<p style="margin:6px 0 0;color:#334155;">关联任务：《${esc(args.taskTitle)}》</p>` : ''}
      <p style="margin:10px 0 0;color:#334155;white-space:pre-wrap;"><strong>原因：</strong>${esc(args.reason)}</p>
    </div>
    <p style="margin:8px 0;color:#475569;font-size:13px;">
      该记录将影响你的年度考核与年终奖金，同事在战功榜可见。若有异议请直接联系记录人。
    </p>
    <p style="margin:24px 0 8px;"><a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500;">查看详情 →</a></p>
  `);
  const result = await sendWithRetry({ to: [args.recipientEmail], subject, html });
  await logNotification({ kind: 'PENALTY_ISSUED', taskId: args.taskId ?? null, subject, recipients: 1 }, result);
  return result;
}
