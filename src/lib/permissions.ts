import { getSession } from './auth';

export async function requireUser() {
  const session = await getSession();
  if (!session?.user) throw Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  if (!session.user.active) throw Response.json({ error: 'INACTIVE' }, { status: 403 });
  return session.user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== 'ADMIN') throw Response.json({ error: 'FORBIDDEN' }, { status: 403 });
  return user;
}
