import { prisma } from './db';

export type LeaderboardRow = {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  points: number;      // sum of actual awarded points (not nominal task.points)
  penalty: number;     // sum of ACTIVE penalty points
  net: number;         // points - penalty (used for ranking)
  completed: number;   // count of approved submissions
  penalties: number;   // count of ACTIVE penalty records
};

// Source of truth for "how many points did this user actually earn":
// the user-level Submission.awardedPoints (set by the reviewer when
// approving). Falls back to task.points for submissions approved before
// the partial-credit field existed. Loops in JS rather than a SQL groupBy
// because we need the COALESCE-style fallback per row.
async function aggregateApprovedPoints(filter: { userId?: string }) {
  const subs = await prisma.submission.findMany({
    where: { status: 'APPROVED', ...(filter.userId ? { userId: filter.userId } : {}) },
    select: {
      userId: true,
      awardedPoints: true,
      task: { select: { points: true } },
    },
  });
  const byUser = new Map<string, { points: number; completed: number }>();
  for (const s of subs) {
    const pts = s.awardedPoints ?? s.task.points;
    const cur = byUser.get(s.userId) ?? { points: 0, completed: 0 };
    cur.points += pts;
    cur.completed += 1;
    byUser.set(s.userId, cur);
  }
  return byUser;
}

export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const [pointsByUser, penaltyGrouped, users] = await Promise.all([
    aggregateApprovedPoints({}),
    prisma.penalty.groupBy({
      by: ['userId'],
      where: { status: 'ACTIVE' },
      _sum: { points: true },
      _count: { _all: true },
    }),
    prisma.user.findMany({ select: { id: true, name: true, email: true, image: true } }),
  ]);

  const byId = new Map(users.map((u) => [u.id, u]));
  const penaltyById = new Map(
    penaltyGrouped.map((p) => [p.userId, { sum: p._sum.points ?? 0, count: p._count._all }])
  );

  // Union of users who earned points OR have penalties so penalised members
  // still appear on the list (as negative contributors).
  const userIdSet = new Set<string>();
  pointsByUser.forEach((_v, k) => userIdSet.add(k));
  penaltyGrouped.forEach((p) => userIdSet.add(p.userId));

  const rows: LeaderboardRow[] = [];
  for (const id of userIdSet) {
    const u = byId.get(id);
    if (!u) continue;
    const g = pointsByUser.get(id);
    const pen = penaltyById.get(id);
    const points = round2(g?.points ?? 0);
    const completed = g?.completed ?? 0;
    const penalty = pen?.sum ?? 0;
    const penalties = pen?.count ?? 0;
    rows.push({
      userId: u.id,
      name: u.name,
      email: u.email,
      image: u.image,
      points,
      penalty,
      net: round2(points - penalty),
      completed,
      penalties,
    });
  }

  rows.sort((a, b) => (b.net - a.net) || (b.completed - a.completed) || (a.penalties - b.penalties));
  return rows;
}

export async function fetchMyStats(userId: string) {
  const [inProgress, submittedByMe, approvedTasks, rejectedTasks, pointsByUser, rewardPending, rewardIssued, penaltyAgg] = await Promise.all([
    prisma.task.count({ where: { claimantId: userId, status: 'CLAIMED' } }),
    prisma.task.count({ where: { claimantId: userId, status: 'SUBMITTED' } }),
    prisma.task.count({ where: { claimantId: userId, status: 'APPROVED' } }),
    prisma.task.count({ where: { claimantId: userId, status: 'REJECTED' } }),
    aggregateApprovedPoints({ userId }),
    prisma.rewardIssuance.count({ where: { recipientId: userId, status: 'PENDING' } }),
    prisma.rewardIssuance.count({ where: { recipientId: userId, status: 'ISSUED' } }),
    prisma.penalty.aggregate({
      where: { userId, status: 'ACTIVE' },
      _sum: { points: true },
      _count: { _all: true },
    }),
  ]);
  const my = pointsByUser.get(userId);
  const points = round2(my?.points ?? 0);
  const penalty = penaltyAgg._sum.points ?? 0;
  const penalties = penaltyAgg._count._all;
  const leaderboard = await fetchLeaderboard();
  const rank = leaderboard.findIndex((r) => r.userId === userId);
  return {
    inProgress,
    awaitingReview: submittedByMe,
    approved: approvedTasks,
    rejected: rejectedTasks,
    points,
    penalty,
    penalties,
    net: round2(points - penalty),
    rewardPending,
    rewardAwaitingAck: rewardIssued,
    rank: rank >= 0 ? rank + 1 : null,
    total: leaderboard.length,
  };
}

// Two-decimal rounding so the leaderboard never shows 18.999999999 for a
// 6 + 12.999 split. JS floats are imprecise; we round at the boundary.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
