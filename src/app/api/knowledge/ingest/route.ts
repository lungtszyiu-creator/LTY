/**
 * 看板召唤管家 ingest · 创建 IngestRequest
 *
 * POST { scope: "all_inbox" | "specific_path:..." }
 * 鉴权：NextAuth session + SUPER_ADMIN
 */
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
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

  const body = (await request.json().catch(() => ({}))) as { scope?: string };
  const scope = body.scope || 'all_inbox';

  // 防止同时多个 pending 堆积（避免老板狂点制造 N 个并发任务）
  const existingPending = await prisma.ingestRequest.findFirst({
    where: { status: { in: ['pending', 'claimed', 'running'] } },
  });
  if (existingPending) {
    return NextResponse.json({
      error: 'BUSY',
      detail: `已有进行中的 ingest（id=${existingPending.id}, status=${existingPending.status}），等它完成再触发`,
      existingId: existingPending.id,
    }, { status: 409 });
  }

  const req = await prisma.ingestRequest.create({
    data: {
      scope,
      status: 'pending',
      requestedById: dbUser.id,
    },
    select: { id: true, status: true, scope: true, requestedAt: true },
  });

  return NextResponse.json({ ...req });
}
