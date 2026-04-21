import { prisma } from './db';

export type FolderAccessDecision = {
  canView: boolean;
  canEdit: boolean;
  effectiveFolderId: string | null;
  effectiveVisibility: 'PUBLIC' | 'DEPARTMENT' | 'PRIVATE' | 'INHERIT';
  reason: string;
};

// Walk from the folder up to root, stopping at the first node whose
// visibility != INHERIT. Admins always pass. The folder creator always has
// full view+edit on anything they created — intent: "创建者随时可以查看自己
// 上传的内容及文件夹内的内容". An INHERIT-only chain with no explicit
// ancestor falls back to PUBLIC.
export async function resolveFolderAccess(
  folderId: string | null,
  user: { id: string; role: string }
): Promise<FolderAccessDecision> {
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

  if (!folderId) {
    return {
      canView: true,
      canEdit: isAdmin,
      effectiveFolderId: null,
      effectiveVisibility: 'PUBLIC',
      reason: 'root-level',
    };
  }

  const cursor: any = await prisma.folder.findUnique({
    where: { id: folderId },
    include: {
      members: true,
      department: { select: { memberships: { select: { userId: true } } } },
    },
  });
  if (!cursor) {
    return { canView: false, canEdit: false, effectiveFolderId: null, effectiveVisibility: 'PRIVATE', reason: 'not-found' };
  }

  // Check if the user is a creator anywhere up the chain — a folder's owner
  // should also retain access to descendants by default, even if a child
  // folder is set to PRIVATE for someone else. We walk the full chain once
  // while also computing the effective visibility node.
  let isCreatorAlongChain = cursor.createdById === user.id;
  let node: any = cursor;
  let climbed: any = cursor;
  while (climbed && climbed.parentId) {
    const parent = await prisma.folder.findUnique({
      where: { id: climbed.parentId },
      include: {
        members: true,
        department: { select: { memberships: { select: { userId: true } } } },
      },
    });
    if (!parent) break;
    if (parent.createdById === user.id) isCreatorAlongChain = true;
    if (node.visibility === 'INHERIT') node = parent; // keep walking to resolve visibility
    climbed = parent;
  }

  // Admin override — global read/write.
  if (isAdmin) {
    return { canView: true, canEdit: true, effectiveFolderId: node?.id ?? cursor.id, effectiveVisibility: node?.visibility ?? 'INHERIT', reason: 'admin-override' };
  }

  // Creator always owns view + edit, regardless of visibility. Matches user
  // expectation that folders they built never lock them out.
  if (isCreatorAlongChain) {
    return { canView: true, canEdit: true, effectiveFolderId: cursor.id, effectiveVisibility: node?.visibility ?? cursor.visibility, reason: 'creator' };
  }

  // If the effective visibility is still INHERIT (no ancestor set it
  // explicitly), treat it as PUBLIC — that's the documented root default.
  if (!node || node.visibility === 'INHERIT') {
    return { canView: true, canEdit: false, effectiveFolderId: node?.id ?? cursor.id, effectiveVisibility: 'PUBLIC', reason: 'inherit-root-public' };
  }

  if (node.visibility === 'PUBLIC') {
    return { canView: true, canEdit: false, effectiveFolderId: node.id, effectiveVisibility: 'PUBLIC', reason: 'public' };
  }

  if (node.visibility === 'DEPARTMENT') {
    const memberIds = new Set((node.department?.memberships ?? []).map((m: any) => m.userId));
    const isDeptMember = memberIds.has(user.id);
    return {
      canView: isDeptMember,
      canEdit: false,
      effectiveFolderId: node.id,
      effectiveVisibility: 'DEPARTMENT',
      reason: isDeptMember ? 'department-member' : 'not-in-department',
    };
  }

  // PRIVATE: only explicit FolderMember rows see it.
  const explicit = (node.members ?? []).find((m: any) => m.userId === user.id);
  if (explicit) {
    return {
      canView: true,
      canEdit: explicit.access === 'EDIT',
      effectiveFolderId: node.id,
      effectiveVisibility: 'PRIVATE',
      reason: 'explicit-member',
    };
  }
  return {
    canView: false,
    canEdit: false,
    effectiveFolderId: node.id,
    effectiveVisibility: 'PRIVATE',
    reason: 'no-access',
  };
}
