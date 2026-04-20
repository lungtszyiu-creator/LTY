import { prisma } from './db';

export type LeaderboardRow = {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  points: number;
  completed: number;
};

export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const grouped = await prisma.task.groupBy({
    by: ['claimantId'],
    where: { status: 'APPROVED', claimantId: { not: null } },
    _sum: { points: true },
    _count: { _all: true },
  });
  const ids = grouped.map((g) => g.claimantId!).filter(Boolean);
  if (ids.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true, image: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return grouped
    .map((g) => {
      const u = byId.get(g.claimantId!);
      if (!u) return null;
      return {
        userId: u.id,
        name: u.name,
        email: u.email,
        image: u.image,
        points: g._sum.points ?? 0,
        completed: g._count._all,
      } as LeaderboardRow;
    })
    .filter((r): r is LeaderboardRow => r !== null)
    .sort((a, b) => (b.points - a.points) || (b.completed - a.completed));
}

export async function fetchMyStats(userId: string) {
  const [inProgress, submittedByMe, approved, rejected, pointsAgg, rewardPending, rewardIssued] = await Promise.all([
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
  ]);
  const points = pointsAgg._sum.points ?? 0;
  const leaderboard = await fetchLeaderboard();
  const rank = leaderboard.findIndex((r) => r.userId === userId);
  return {
    inProgress,
    awaitingReview: submittedByMe,
    approved,
    rejected,
    points,
    rewardPending,            // approved, waiting for admin to pay out
    rewardAwaitingAck: rewardIssued, // admin paid, waiting for member to confirm
    rank: rank >= 0 ? rank + 1 : null,
    total: leaderboard.length,
  };
}
