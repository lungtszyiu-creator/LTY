import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';
import { saveUploadedFile } from '@/lib/storage';
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
    if (!access.canEdit) {
      return NextResponse.json({ error: 'NO_UPLOAD_PERMISSION' }, { status: 403 });
    }
  }

  const saved = await Promise.all(files.map((f) => saveUploadedFile(f)));
  const records = await prisma.$transaction(
    saved.map((s) =>
      prisma.attachment.create({
        data: {
          filename: s.filename,
          storedPath: s.storedPath,
          mimeType: s.mimeType,
          size: s.size,
          folderId: folderId || null,
          uploadedById: user.id,
        },
      })
    )
  );
  return NextResponse.json(records, { status: 201 });
}
