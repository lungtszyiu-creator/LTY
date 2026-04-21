import { prisma } from './db';

export type FolderAccessDecision = {
  canView: boolean;
  canEdit: boolean;
  // The folder that the decision came from (may be an ancestor when visibility=INHERIT).
  effectiveFolderId: string | null;
  effectiveVisibility: 'PUBLIC' | 'DEPARTMENT' | 'PRIVATE' | 'INHERIT';
  reason: string;
};

// Walk from the folder up to root, stopping at the first node whose
// visibility != INHERIT. Admins always pass. The folder creator always edits.
export async function resolveFolderAccess(
  folderId: string | null,
  user: { id: string; role: string }
): Promise<FolderAccessDecision> {
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

  // Root-level (no folder): only explicitly PUBLIC-by-default for the "my uploads"
  // area. For simplicity, root is treated as PUBLIC view for everyone.
  if (!folderId) {
    return {
      canView: true,
      canEdit: isAdmin,
      effectiveFolderId: null,
      effectiveVisibility: 'PUBLIC',
      reason: 'root-level',
    };
  }

  // Walk up.
  let cursor: any = await prisma.folder.findUnique({
    where: { id: folderId },
    include: {
      members: true,
      department: { select: { memberships: { select: { userId: true } } } },
    },
  });
  if (!cursor) {
    return { canView: false, canEdit: false, effectiveFolderId: null, effectiveVisibility: 'PRIVATE', reason: 'not-found' };
  }

  // If user is the creator, they can always edit their own folder subtree
  // (until they hand it to someone else by changing visibility).
  const isCreator = cursor.createdById === user.id;

  let node = cursor;
  while (node && node.visibility === 'INHERIT' && node.parentId) {
    node = await prisma.folder.findUnique({
      where: { id: node.parentId },
      include: {
        members: true,
        department: { select: { memberships: { select: { userId: true } } } },
      },
    });
    if (!node) break;
  }

  if (!node) {
    // Reached root via INHERIT chain — treat as DEPARTMENT-members-only by
    // default (safer) or PUBLIC (friendlier). We pick PUBLIC so shared files
    // with no explicit restriction are visible to everyone in the org.
    return {
      canView: true,
      canEdit: isAdmin || isCreator,
      effectiveFolderId: folderId,
      effectiveVisibility: 'PUBLIC',
      reason: 'inherit-to-root-public',
    };
  }

  if (isAdmin) {
    return { canView: true, canEdit: true, effectiveFolderId: node.id, effectiveVisibility: node.visibility, reason: 'admin-override' };
  }

  if (node.visibility === 'PUBLIC') {
    return { canView: true, canEdit: isCreator, effectiveFolderId: node.id, effectiveVisibility: 'PUBLIC', reason: 'public' };
  }

  if (node.visibility === 'DEPARTMENT') {
    const memberIds = new Set((node.department?.memberships ?? []).map((m: any) => m.userId));
    const isDeptMember = memberIds.has(user.id);
    return {
      canView: isDeptMember || isCreator,
      canEdit: isCreator,
      effectiveFolderId: node.id,
      effectiveVisibility: 'DEPARTMENT',
      reason: isDeptMember ? 'department-member' : 'not-in-department',
    };
  }

  // PRIVATE: only explicit FolderMember rows + creator can see.
  const explicit = (node.members ?? []).find((m: any) => m.userId === user.id);
  if (explicit) {
    return {
      canView: true,
      canEdit: explicit.access === 'EDIT' || isCreator,
      effectiveFolderId: node.id,
      effectiveVisibility: 'PRIVATE',
      reason: 'explicit-member',
    };
  }
  return {
    canView: isCreator,
    canEdit: isCreator,
    effectiveFolderId: node.id,
    effectiveVisibility: 'PRIVATE',
    reason: isCreator ? 'creator-only' : 'no-access',
  };
}
