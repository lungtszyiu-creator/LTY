import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  await prisma.announcementReading.upsert({
    where: { announcementId_userId: { announcementId: params.id, userId: user.id } },
    update: {},
    create: { announcementId: params.id, userId: user.id },
  });
  return NextResponse.json({ ok: true });
}
