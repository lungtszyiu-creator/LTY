/**
 * Mac 端 IngestWorker 轮询 pending 任务
 *
 * GET /api/knowledge/ingest/pending
 * 同时把 status 从 pending → claimed（防止重复 claim）
 *
 * 鉴权：Authorization: Bearer <BLOB_SYNC_SECRET>（复用看板上传那把密钥）
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const auth = request.headers.get('authorization') ?? '';
  const expected = process.env.BLOB_SYNC_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'SERVER_NOT_CONFIGURED' }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  // 取一条 pending，原子地变为 claimed（避免多 worker 并发抢）
  // Postgres 用 UPDATE...RETURNING；Prisma 用事务包一下 findFirst + update
  const claimed = await prisma.$transaction(async (tx) => {
    const row = await tx.ingestRequest.findFirst({
      where: { status: 'pending' },
      orderBy: { requestedAt: 'asc' },
      select: { id: true, scope: true, requestedAt: true },
    });
    if (!row) return null;
    return tx.ingestRequest.update({
      where: { id: row.id },
      data: { status: 'claimed', claimedAt: new Date() },
      select: { id: true, scope: true, requestedAt: true, claimedAt: true },
    });
  });

  return NextResponse.json({ pending: claimed ? [claimed] : [] });
}
