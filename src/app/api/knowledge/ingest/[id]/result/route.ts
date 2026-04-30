/**
 * Mac 端 IngestWorker 回报结果
 *
 * POST /api/knowledge/ingest/<id>/result
 * body: {
 *   status: "running" | "done" | "error",
 *   result?: string,           // markdown 报告
 *   commit_sha?: string,
 *   error?: string
 * }
 *
 * 鉴权：Authorization: Bearer <BLOB_SYNC_SECRET>
 */
import { NextResponse } from 'next/server';
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
    result?: string;
    commit_sha?: string;
    error?: string;
  };
  const status = body.status;
  if (!status || !['running', 'done', 'error'].includes(status)) {
    return NextResponse.json({ error: 'BAD_STATUS' }, { status: 400 });
  }

  const row = await prisma.ingestRequest.findUnique({ where: { id: params.id } });
  if (!row) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const update: Record<string, unknown> = { status };
  if (status === 'running' && !row.startedAt) {
    update.startedAt = new Date();
  }
  if (status === 'done' || status === 'error') {
    update.finishedAt = new Date();
  }
  if (body.result !== undefined) update.result = body.result;
  if (body.commit_sha !== undefined) update.commitSha = body.commit_sha;
  if (body.error !== undefined) update.errorMessage = body.error;

  await prisma.ingestRequest.update({ where: { id: params.id }, data: update });
  return NextResponse.json({ ok: true });
}
