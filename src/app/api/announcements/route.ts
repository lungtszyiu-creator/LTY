import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser, requireAdmin } from '@/lib/permissions';
import { notifyAnnouncementPublished } from '@/lib/email';

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const unreadOnly = req.nextUrl.searchParams.get('unread') === '1';

  const items = await prisma.announcement.findMany({
    orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      attachments: true,
      readings: { where: { userId: user.id }, select: { readAt: true } },
      _count: { select: { readings: true } },
    },
  });

  const withReadFlag = items.map((a) => ({
    ...a,
    readByMe: a.readings.length > 0,
    readAtByMe: a.readings[0]?.readAt ?? null,
    readings: undefined, // hide raw rows
  }));

  return NextResponse.json(unreadOnly ? withReadFlag.filter((a) => !a.readByMe) : withReadFlag);
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
  pinned: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  attachmentIds: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const data = createSchema.parse(await req.json());

  const created = await prisma.$transaction(async (tx) => {
    const a = await tx.announcement.create({
      data: {
        title: data.title,
        body: data.body,
        pinned: data.pinned ?? false,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        createdById: admin.id,
      },
    });
    if (data.attachmentIds?.length) {
      await tx.attachment.updateMany({
        where: { id: { in: data.attachmentIds }, taskId: null, submissionId: null, announcementId: null, reportId: null },
        data: { announcementId: a.id },
      });
    }
    return a;
  });

  // Push an email to everyone so members know a new announcement is up
  // without having to poll /announcements.
  notifyAnnouncementPublished({
    announcementId: created.id,
    authorId: admin.id,
    title: created.title,
    body: created.body,
    authorName: admin.name ?? admin.email ?? '管理员',
    pinned: created.pinned,
  }).catch((e) => console.error('[announcement] notify failed', e));

  return NextResponse.json(created, { status: 201 });
}
