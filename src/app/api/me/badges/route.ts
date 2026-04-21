import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';

// Aggregate the small counters the nav surfaces as red dots so the user
// notices pending work without having to open each page.
export async function GET() {
  const user = await requireUser();

  const [unreadAnnouncements, pendingApprovals, incomingReports] = await Promise.all([
    // Active (non-expired) announcements I haven't marked as read yet.
    prisma.announcement.count({
      where: {
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          { readings: { none: { userId: user.id } } },
        ],
      },
    }),
    // Approval steps waiting for my decision.
    prisma.approvalStep.count({
      where: {
        approverId: user.id,
        kind: 'APPROVAL',
        decision: null,
        superseded: false,
      },
    }),
    // Work reports submitted TO me.
    prisma.report.count({
      where: { reportToId: user.id, submittedAt: { not: null } },
    }),
  ]);

  return NextResponse.json({ unreadAnnouncements, pendingApprovals, incomingReports });
}
