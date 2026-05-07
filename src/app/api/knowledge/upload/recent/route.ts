/**
 * 给前端 /knowledge 显示最近上传的列表（含 pending / downloaded 状态）。
 * NextAuth + SUPER_ADMIN 鉴权。
 */
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
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

  const recent = await prisma.pendingUpload.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      filename: true,
      contentType: true,
      sizeBytes: true,
      status: true,
      vaultPath: true,
      errorMessage: true,
      description: true,
      createdAt: true,
      downloadedAt: true,
    },
  });

  return NextResponse.json({ recent });
}
