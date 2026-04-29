/**
 * 知识管理部访问权限
 *
 * MVP 阶段简单：只有 SUPER_ADMIN（老板）能看 /knowledge。
 * 普通员工 redirect /dashboard（不暴露页面存在）。
 *
 * 未来可扩展：在 User 模型加 knowledgeRole 字段，类似 financeRole 那套。
 */
import { redirect } from 'next/navigation';
import { getSession } from './auth';
import { prisma } from './db';

export async function requireKnowledgeView(): Promise<{ userId: string }> {
  const session = await getSession();
  if (!session?.user) redirect('/login?next=/knowledge');

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, active: true },
  });
  if (!dbUser?.active) redirect('/login?next=/knowledge');

  if (dbUser.role !== 'SUPER_ADMIN') {
    redirect('/dashboard');
  }
  return { userId: dbUser.id };
}
