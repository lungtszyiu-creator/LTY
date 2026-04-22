import { prisma } from './db';

export type DocAccessDecision = {
  canView: boolean;
  canEdit: boolean;
  reason: string;
};

// Reuses the same visibility model as Folder: PUBLIC = everyone in company,
// DEPARTMENT = that dept's members, PRIVATE = explicit DocMember rows.
// Creators and global admins always retain full access.
export async function resolveDocAccess(
  docId: string,
  user: { id: string; role: string }
): Promise<DocAccessDecision> {
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

  const doc = await prisma.doc.findUnique({
    where: { id: docId },
    include: {
      members: true,
      department: { select: { memberships: { select: { userId: true } } } },
    },
  });
  if (!doc) return { canView: false, canEdit: false, reason: 'not-found' };
  if (doc.deletedAt) return { canView: false, canEdit: false, reason: 'deleted' };

  if (isAdmin) return { canView: true, canEdit: true, reason: 'admin' };
  if (doc.creatorId === user.id) return { canView: true, canEdit: true, reason: 'creator' };

  if (doc.visibility === 'PUBLIC') {
    return { canView: true, canEdit: true, reason: 'public-edit' };
  }

  if (doc.visibility === 'DEPARTMENT') {
    const memberIds = new Set((doc.department?.memberships ?? []).map((m) => m.userId));
    const isMember = memberIds.has(user.id);
    return { canView: isMember, canEdit: isMember, reason: isMember ? 'dept-member' : 'not-in-dept' };
  }

  // PRIVATE: explicit members only
  const explicit = doc.members.find((m) => m.userId === user.id);
  if (explicit) {
    return {
      canView: true,
      canEdit: explicit.access === 'EDIT',
      reason: 'explicit-member',
    };
  }
  return { canView: false, canEdit: false, reason: 'no-access' };
}

// Returns the set of doc IDs the user can view. Used by the tree-list page
// so we don't render ghost parents or hit the per-doc access check in a loop.
export async function listVisibleDocIds(user: { id: string; role: string }): Promise<Set<string>> {
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  if (isAdmin) {
    const rows = await prisma.doc.findMany({ where: { deletedAt: null }, select: { id: true } });
    return new Set(rows.map((r) => r.id));
  }

  // Non-admin path: gather creator + public + dept-member + explicit-member.
  const [created, publics, deptMemberships, privateRows] = await Promise.all([
    prisma.doc.findMany({ where: { creatorId: user.id, deletedAt: null }, select: { id: true } }),
    prisma.doc.findMany({ where: { visibility: 'PUBLIC', deletedAt: null }, select: { id: true } }),
    prisma.departmentMembership.findMany({ where: { userId: user.id }, select: { departmentId: true } }),
    prisma.docMember.findMany({ where: { userId: user.id }, select: { docId: true } }),
  ]);
  const deptIds = deptMemberships.map((m) => m.departmentId);
  const deptDocs = await prisma.doc.findMany({
    where: { visibility: 'DEPARTMENT', departmentId: { in: deptIds }, deletedAt: null },
    select: { id: true },
  });

  const set = new Set<string>();
  created.forEach((d) => set.add(d.id));
  publics.forEach((d) => set.add(d.id));
  deptDocs.forEach((d) => set.add(d.id));
  privateRows.forEach((r) => set.add(r.docId));
  return set;
}
