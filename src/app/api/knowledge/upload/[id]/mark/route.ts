/**
 * Mac 端 BlobSync 标记某条 pending upload 为 downloaded（或 failed）
 *
 * POST body: { status: "downloaded" | "failed", vault_path?: string, error?: string }
 * 鉴权：Authorization: Bearer <BLOB_SYNC_SECRET>
 *
 * downloaded 后 Vercel 删 blob（节约存储费）。
 */
import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const auth = request.headers.get('authorization') ?? '';
  const expected = process.env.BLOB_SYNC_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'SERVER_NOT_CONFIGURED' }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    status?: string;
    vault_path?: string;
    error?: string;
  };
  const status = body.status;
  if (status !== 'downloaded' && status !== 'failed') {
    return NextResponse.json({ error: 'BAD_STATUS' }, { status: 400 });
  }

  const row = await prisma.pendingUpload.findUnique({ where: { id: params.id } });
  if (!row) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  await prisma.pendingUpload.update({
    where: { id: params.id },
    data: {
      status,
      downloadedAt: status === 'downloaded' ? new Date() : row.downloadedAt,
      vaultPath: body.vault_path ?? row.vaultPath,
      errorMessage: body.error ?? row.errorMessage,
    },
  });

  // downloaded 成功 → 删 blob 节约存储费（不阻塞响应）
  if (status === 'downloaded') {
    try {
      await del(row.blobUrl);
    } catch (e) {
      console.warn('[knowledge/upload/mark] blob del fail (non-fatal):', e);
    }
  }

  return NextResponse.json({ ok: true });
}
