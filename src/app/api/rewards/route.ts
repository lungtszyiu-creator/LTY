import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser, requireAdmin } from '@/lib/permissions';

// GET /api/rewards
// - admins: all issuances (optionally filter by status / recipient)
// - members: only their own
export async function GET(req: NextRequest) {
  const user = await requireUser();
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  const status = req.nextUrl.searchParams.get('status');
  const mine = req.nextUrl.searchParams.get('mine') === '1';
  const recipientId = req.nextUrl.searchParams.get('recipientId');

  const where: any = {};
  if (status) where.status = status;
  if (!isAdmin || mine) where.recipientId = user.id;
  else if (recipientId) where.recipientId = recipientId;

  const items = await prisma.rewardIssuance.findMany({
    where,
    include: {
      task: { select: { id: true, title: true, reward: true, points: true } },
      recipient: { select: { id: true, name: true, email: true, image: true } },
      issuedBy: { select: { id: true, name: true, email: true } },
      receipts: true,
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
  return NextResponse.json(items);
}
