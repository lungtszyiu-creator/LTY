import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';
import { saveUploadedFile, hasBlobConfigured } from '@/lib/storage';
import { resolveFolderAccess } from '@/lib/folderAccess';

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

// Upload one or more files. Returned attachments default to "orphan" (no
// taskId/submissionId/folderId); the client passes their ids when creating
// a task or submission, which attaches them. If a `folderId` query param is
// provided, files are placed directly in that folder after a permission
// check (edit-access required).
export async function POST(req: NextRequest) {
  const user = await requireUser();
  const form = await req.formData();
  const files = form.getAll('file').filter((v): v is File => v instanceof File);
  if (files.length === 0)
    return NextResponse.json({ error: 'NO_FILE' }, { status: 400 });

  for (const f of files) {
    if (f.size > MAX_SIZE)
      return NextResponse.json({ error: 'FILE_TOO_LARGE', filename: f.name }, { status: 413 });
  }

  const folderId = req.nextUrl.searchParams.get('folderId');
  if (folderId) {
    const access = await resolveFolderAccess(folderId, { id: user.id, role: user.role });
    if (!access.canUpload) {
      return NextResponse.json({ error: 'NO_UPLOAD_PERMISSION' }, { status: 403 });
    }
  }

  // Storage is auto-selected inside saveUploadedFile: Vercel Blob when
  // BLOB_READ_WRITE_TOKEN is set, otherwise bytes go inline into Postgres
  // (5 MB per file cap) so the app works with zero extra config.
  let saved;
  try {
    saved = await Promise.all(files.map((f) => saveUploadedFile(f)));
  } catch (e: any) {
    const raw = e?.message ?? String(e);
    console.error('[upload] save failed', e);
    return NextResponse.json({
      error: 'UPLOAD_FAILED',
      message: raw,
    }, { status: raw.startsWith('FILE_TOO_LARGE_FOR_DB_STORAGE') ? 413 : 500 });
  }

  const records = await prisma.$transaction(
    saved.map((s) =>
      prisma.attachment.create({
        data: {
          filename: s.filename,
          storedPath: s.storedPath,
          content: s.content ?? undefined,
          mimeType: s.mimeType,
          size: s.size,
          folderId: folderId || null,
          uploadedById: user.id,
        },
        // Don't echo the blob back to the client (bandwidth).
        select: {
          id: true, filename: true, mimeType: true, size: true,
          storedPath: true, createdAt: true,
        },
      })
    )
  );
  const storageMode = hasBlobConfigured() ? 'blob' : 'db-inline';
  return NextResponse.json(records.map((r) => ({ ...r, storageMode })), { status: 201 });
}
