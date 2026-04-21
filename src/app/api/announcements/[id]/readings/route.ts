import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';

// Roster of who has / hasn't acknowledged an announcement. Limited to
// SUPER_ADMIN and the author — regular ADMINs don't automatically get to
// see read status of announcements they didn't publish.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const ann = await prisma.announcement.findUnique({
    where: { id: params.id },
    select: { createdById: true },
  });
  if (!ann) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const isSuper = user.role === 'SUPER_ADMIN';
  const isAuthor = ann.createdById === user.id;
  if (!isSuper && !isAuthor) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const [allUsers, readings] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true, image: true, role: true },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    }),
    prisma.announcementReading.findMany({
      where: { announcementId: params.id },
      select: { userId: true, readAt: true },
    }),
  ]);

  const readMap = new Map(readings.map((r) => [r.userId, r.readAt]));
  const read = allUsers
    .filter((u) => readMap.has(u.id))
    .map((u) => ({ ...u, readAt: readMap.get(u.id)?.toISOString() ?? null }));
  const unread = allUsers.filter((u) => !readMap.has(u.id));

  return NextResponse.json({
    read,
    unread,
    totalActive: allUsers.length,
  });
}
