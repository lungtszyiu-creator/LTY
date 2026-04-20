import { prisma } from './db';

export type LeaderboardRow = {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  points: number;      // positive points from approved tasks
  penalty: number;     // sum of ACTIVE penalty points
  net: number;         // points - penalty (used for ranking)
  completed: number;
  penalties: number;   // count of ACTIVE penalty records
};

export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const [grouped, penaltyGrouped, users] = await Promise.all([
    prisma.task.groupBy({
      by: ['claimantId'],
      where: { status: 'APPROVED', claimantId: { not: null } },
      _sum: { points: true },
      _count: { _all: true },
    }),
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
  grouped.forEach((g) => g.claimantId && userIdSet.add(g.claimantId));
  penaltyGrouped.forEach((p) => userIdSet.add(p.userId));

  const rows: LeaderboardRow[] = [];
  for (const id of userIdSet) {
    const u = byId.get(id);
    if (!u) continue;
    const g = grouped.find((x) => x.claimantId === id);
    const pen = penaltyById.get(id);
    const points = g?._sum.points ?? 0;
    const completed = g?._count._all ?? 0;
    const penalty = pen?.sum ?? 0;
    const penalties = pen?.count ?? 0;
    rows.push({
      userId: u.id,
      name: u.name,
      email: u.email,
      image: u.image,
      points,
      penalty,
      net: points - penalty,
      completed,
      penalties,
    });
  }

  rows.sort((a, b) => (b.net - a.net) || (b.completed - a.completed) || (a.penalties - b.penalties));
  return rows;
}

export async function fetchMyStats(userId: string) {
  const [inProgress, submittedByMe, approved, rejected, pointsAgg, rewardPending, rewardIssued, penaltyAgg] = await Promise.all([
    prisma.task.count({ where: { claimantId: userId, status: 'CLAIMED' } }),
    prisma.task.count({ where: { claimantId: userId, status: 'SUBMITTED' } }),
    prisma.task.count({ where: { claimantId: userId, status: 'APPROVED' } }),
    prisma.task.count({ where: { claimantId: userId, status: 'REJECTED' } }),
    prisma.task.aggregate({
      where: { claimantId: userId, status: 'APPROVED' },
      _sum: { points: true },
    }),
    prisma.rewardIssuance.count({ where: { recipientId: userId, status: 'PENDING' } }),
    prisma.rewardIssuance.count({ where: { recipientId: userId, status: 'ISSUED' } }),
    prisma.penalty.aggregate({
      where: { userId, status: 'ACTIVE' },
      _sum: { points: true },
      _count: { _all: true },
    }),
  ]);
  const points = pointsAgg._sum.points ?? 0;
  const penalty = penaltyAgg._sum.points ?? 0;
  const penalties = penaltyAgg._count._all;
  const leaderboard = await fetchLeaderboard();
  const rank = leaderboard.findIndex((r) => r.userId === userId);
  return {
    inProgress,
    awaitingReview: submittedByMe,
    approved,
    rejected,
    points,
    penalty,
    penalties,
    net: points - penalty,
    rewardPending,
    rewardAwaitingAck: rewardIssued,
    rank: rank >= 0 ? rank + 1 : null,
    total: leaderboard.length,
  };
}
