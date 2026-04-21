import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';
import { resolveFolderAccess } from '@/lib/folderAccess';

// Attachments live either inline in Postgres (zero-config default) or in
// Vercel Blob (when BLOB_READ_WRITE_TOKEN is set). Either way access is
// gated behind an authenticated session.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await requireUser();
  const att = await prisma.attachment.findUnique({ where: { id: params.id } });
  if (!att) return new Response('not found', { status: 404 });

  // Inline content → stream it back with correct headers so browsers
  // preview images/PDFs natively and download binaries correctly.
  if (att.content) {
    const headers = new Headers();
    headers.set('Content-Type', att.mimeType || 'application/octet-stream');
    headers.set('Content-Length', String(att.size));
    // RFC 5987 encoding so non-ASCII filenames survive.
    headers.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(att.filename)}`);
    headers.set('Cache-Control', 'private, max-age=3600');
    const buf = att.content as unknown as Buffer;
    return new Response(new Uint8Array(buf), { status: 200, headers });
  }

  // Legacy Blob-hosted file: redirect to the CDN URL.
  if (att.storedPath) return NextResponse.redirect(att.storedPath, 302);
  return new Response('no content', { status: 404 });
}

// Delete a file. Admin or the uploader can always delete. Otherwise, for
// folder-hosted files, caller must have edit access on the folder.
// Files attached to a task/submission/reward/announcement/report/approval
// are refused for non-admins so dangling references never appear in those UIs.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const att = await prisma.attachment.findUnique({ where: { id: params.id } });
  if (!att) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  const isUploader = att.uploadedById === user.id;

  const blockingAssoc =
    att.taskId || att.submissionId || att.rewardId ||
    att.announcementId || att.reportId || att.approvalInstanceId;
  if (blockingAssoc && !isAdmin) {
    return NextResponse.json({ error: 'ATTACHED_ELSEWHERE', message: '该文件关联了任务 / 审批 / 汇报，仅管理员可删除' }, { status: 409 });
  }

  if (!isAdmin && !isUploader) {
    if (!att.folderId) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    const access = await resolveFolderAccess(att.folderId, { id: user.id, role: user.role });
    if (!access.canEdit) return NextResponse.json({ error: 'NO_EDIT' }, { status: 403 });
  }

  await prisma.attachment.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
