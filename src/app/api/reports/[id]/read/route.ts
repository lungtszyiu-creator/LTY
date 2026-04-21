import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';

// Recipient of a report marks it as seen. Stamps readAtByReporter so the
// nav unread badge drops. Idempotent — re-clicking doesn't push the
// timestamp forward (we only set it if still null).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const report = await prisma.report.findUnique({
    where: { id: params.id },
    select: { id: true, reportToId: true, readAtByReporter: true },
  });
  if (!report) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (report.reportToId !== user.id) {
    return NextResponse.json({ error: 'NOT_REPORTEE' }, { status: 403 });
  }
  if (report.readAtByReporter) {
    return NextResponse.json({ ok: true, alreadyRead: true, readAt: report.readAtByReporter });
  }
  const now = new Date();
  await prisma.report.update({
    where: { id: params.id },
    data: { readAtByReporter: now },
  });
  return NextResponse.json({ ok: true, readAt: now.toISOString() });
}
