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

type SendArgs = { to: string[]; subject: string; html: string };

async function send({ to, subject, html }: SendArgs) {
  const t = getTransporter();
  if (!t) { console.warn('[email] GMAIL_USER/APP_PASSWORD not set; skipping'); return; }
  const unique = Array.from(new Set(to.filter(Boolean)));
  if (unique.length === 0) return;
  try {
    await t.sendMail({
      from: `"LTY 旭珑 · 任务池" <${GMAIL_USER}>`,
      to: GMAIL_USER,        // send to self to satisfy SMTP "to" requirement
      bcc: unique,           // real recipients hidden from each other
      subject,
      html,
    });
  } catch (e) {
    console.error('[email] send failed', e);
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

export async function notifyTaskPublished(task: {
  id: string; title: string; description: string; reward: string | null; deadline: Date | null;
}) {
  const members = await prisma.user.findMany({
    where: { role: 'MEMBER', active: true },
    select: { email: true },
  });
  const emails = members.map((m) => m.email).filter((e): e is string => !!e);
  if (emails.length === 0) return;

  const link = `${APP_URL}/tasks/${task.id}`;
  const descPreview = task.description.length > 300 ? task.description.slice(0, 300) + '…' : task.description;
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:18px;">📢 新任务：${esc(task.title)}</h2>
    <p style="color:#475569;margin:0 0 16px;">有新任务发布，欢迎领取。</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:16px;white-space:pre-wrap;font-size:14px;">${esc(descPreview)}</div>
    ${task.reward ? `<p style="margin:8px 0;"><strong>奖励：</strong>${esc(task.reward)}</p>` : ''}
    ${task.deadline ? `<p style="margin:8px 0;"><strong>截止：</strong>${esc(new Date(task.deadline).toLocaleString('zh-CN'))}</p>` : ''}
    <p style="margin:24px 0 8px;"><a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500;">查看并领取 →</a></p>
  `);
  await send({ to: emails, subject: `[LTY · 任务池] 新任务：${task.title}`, html });
}

export async function notifySubmission(args: {
  taskId: string; taskTitle: string; submitterName: string; submitterEmail: string; note: string;
}) {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', active: true },
    select: { email: true },
  });
  const emails = admins.map((a) => a.email).filter((e): e is string => !!e);
  if (emails.length === 0) return;

  const link = `${APP_URL}/tasks/${args.taskId}`;
  const notePreview = args.note.length > 400 ? args.note.slice(0, 400) + '…' : args.note;
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:18px;">🔔 收到新提交</h2>
    <p style="color:#475569;margin:0 0 16px;"><strong>${esc(args.submitterName || args.submitterEmail)}</strong> 提交了任务《${esc(args.taskTitle)}》，等待审核。</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:16px;white-space:pre-wrap;font-size:14px;">${esc(notePreview)}</div>
    <p style="margin:24px 0 8px;"><a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500;">前往审核 →</a></p>
  `);
  await send({ to: emails, subject: `[LTY · 任务池] 待审核：${args.taskTitle}`, html });
}
