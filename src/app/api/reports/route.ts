import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser, requireAdmin } from '@/lib/permissions';
import { currentPeriodStart, currentPeriodEnd, currentDueAt, formatPeriod } from '@/lib/periods';
import { notifyReportSubmitted } from '@/lib/email';

// GET list — admins see everyone; members see their own + ones where they're
// the reportTo (their reports receive inbox).
export async function GET(req: NextRequest) {
  const user = await requireUser();
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  const type = req.nextUrl.searchParams.get('type') as 'WEEKLY' | 'MONTHLY' | null;
  const scope = req.nextUrl.searchParams.get('scope'); // "mine" | "incoming"
  const userId = req.nextUrl.searchParams.get('userId');
  const status = req.nextUrl.searchParams.get('status');
  const limit = Math.min(200, Number(req.nextUrl.searchParams.get('limit') ?? 50));

  const where: any = {};
  if (type) where.type = type;
  if (status) where.status = status;
  if (scope === 'mine') where.userId = user.id;
  else if (scope === 'incoming') where.reportToId = user.id;
  else if (!isAdmin) where.OR = [{ userId: user.id }, { reportToId: user.id }];
  else if (userId) where.userId = userId;

  const items = await prisma.report.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      reportTo: { select: { id: true, name: true, email: true } },
      attachments: true,
    },
    orderBy: [{ periodStart: 'desc' }, { type: 'asc' }],
    take: limit,
  });
  return NextResponse.json(items);
}

const upsertSchema = z.object({
  type: z.enum(['WEEKLY', 'MONTHLY']),
  periodStart: z.string().datetime().optional(),
  contentDone: z.string().max(5000).nullable().optional(),
  contentPlan: z.string().max(5000).nullable().optional(),
  contentBlockers: z.string().max(5000).nullable().optional(),
  contentAsks: z.string().max(5000).nullable().optional(),
  attachmentIds: z.array(z.string()).optional(),
  submit: z.boolean().optional(),
  reportToId: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const data = upsertSchema.parse(await req.json());

  const refDate = data.periodStart ? new Date(data.periodStart) : new Date();
  const periodStart = currentPeriodStart(data.type, refDate);
  const periodEnd = currentPeriodEnd(data.type, refDate);
  const dueAt = currentDueAt(data.type, refDate);

  const now = new Date();
  const submittedAt = data.submit ? now : null;
  // If submitting and already past due → LATE.
  const status = data.submit ? (now > dueAt ? 'LATE' : 'SUBMITTED') : 'PENDING';

  const existing = await prisma.report.findUnique({
    where: { userId_type_periodStart: { userId: user.id, type: data.type, periodStart } },
  });

  const saved = await prisma.$transaction(async (tx) => {
    let report;
    if (existing) {
      report = await tx.report.update({
        where: { id: existing.id },
        data: {
          contentDone: data.contentDone ?? existing.contentDone,
          contentPlan: data.contentPlan ?? existing.contentPlan,
          contentBlockers: data.contentBlockers ?? existing.contentBlockers,
          contentAsks: data.contentAsks ?? existing.contentAsks,
          reportToId: data.reportToId === undefined ? existing.reportToId : (data.reportToId || null),
          ...(data.submit ? { submittedAt: submittedAt!, status } : {}),
        },
      });
    } else {
      report = await tx.report.create({
        data: {
          userId: user.id,
          type: data.type,
          periodStart,
          periodEnd,
          dueAt,
          contentDone: data.contentDone ?? null,
          contentPlan: data.contentPlan ?? null,
          contentBlockers: data.contentBlockers ?? null,
          contentAsks: data.contentAsks ?? null,
          reportToId: data.reportToId || null,
          submittedAt,
          status,
        },
      });
    }
    if (data.attachmentIds?.length) {
      await tx.attachment.updateMany({
        where: {
          id: { in: data.attachmentIds },
          taskId: null, submissionId: null, rewardId: null,
          announcementId: null, reportId: null,
        },
        data: { reportId: report.id },
      });
    }
    return report;
  });

  // Email reportee when a submit happened (not for saved drafts).
  if (data.submit && saved.reportToId) {
    const reportTo = await prisma.user.findUnique({
      where: { id: saved.reportToId },
      select: { email: true, name: true },
    });
    if (reportTo?.email) {
      notifyReportSubmitted({
        recipientEmail: reportTo.email,
        recipientName: reportTo.name ?? reportTo.email,
        authorName: user.name ?? user.email ?? '',
        reportType: data.type,
        periodLabel: formatPeriod(data.type, periodStart, periodEnd),
        done: data.contentDone ?? null,
        reportId: saved.id,
      }).catch((e) => console.error('[report] notify reportee failed', e));
    }
  }

  return NextResponse.json(saved);
}
