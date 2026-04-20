import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  await requireAdmin();
  const limit = Math.min(200, Number(req.nextUrl.searchParams.get('limit') ?? 50));
  const logs = await prisma.notificationLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return NextResponse.json(logs);
}
