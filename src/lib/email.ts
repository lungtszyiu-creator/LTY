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
