import { getSession } from './auth';
import type { Role } from './auth';
import { hasMinRole } from './auth';

export async function requireUser() {
  const session = await getSession();
  if (!session?.user) throw Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  if (!session.user.active) throw Response.json({ error: 'INACTIVE' }, { status: 403 });
  return session.user;
}

// Both ADMIN and SUPER_ADMIN pass the "admin gate" — use requireSuperAdmin when
// an action should be restricted to the founder tier only (e.g. promoting admins,
// editing roles of other admins, deleting).
export async function requireAdmin() {
  const user = await requireUser();
  if (!hasMinRole(user.role as Role, 'ADMIN'))
    throw Response.json({ error: 'FORBIDDEN' }, { status: 403 });
  return user;
}

export async function requireSuperAdmin() {
  const user = await requireUser();
  if (!hasMinRole(user.role as Role, 'SUPER_ADMIN'))
    throw Response.json({ error: 'FORBIDDEN_SUPER_ADMIN_ONLY' }, { status: 403 });
  return user;
}

export { hasMinRole };
export type { Role };
