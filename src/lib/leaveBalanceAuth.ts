import { prisma } from './db';

// Who can set/change a user's annual + comp leave balances?
//
//   - SUPER_ADMIN: always.
//   - Lead of any department whose name contains "人事" or "HR" (case
//     insensitive): yes — typical org has one HR dept, its lead drives the
//     balance sheet.
//   - Everyone else (regular ADMIN, DeptAdmin, MEMBER): no. Prevents
//     department managers from giving themselves/team members extra days.
export async function canManageLeaveBalance(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, active: true },
  });
  if (!user || !user.active) return false;
  if (user.role === 'SUPER_ADMIN') return true;

  const hrLead = await prisma.department.findFirst({
    where: {
      leadUserId: userId,
      active: true,
      OR: [
        { name: { contains: '人事' } },
        { name: { contains: 'HR', mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
  return !!hrLead;
}
