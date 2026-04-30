/**
 * 前端轮询 IngestRequest 状态
 *
 * GET /api/knowledge/ingest/<id>
 * 鉴权：NextAuth + SUPER_ADMIN
 */
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, active: true },
  });
  if (!dbUser?.active || dbUser.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 404 });
  }

  const row = await prisma.ingestRequest.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      scope: true,
      status: true,
      result: true,
      commitSha: true,
      errorMessage: true,
      requestedAt: true,
      claimedAt: true,
      startedAt: true,
      finishedAt: true,
    },
  });
  if (!row) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  return NextResponse.json(row);
}
