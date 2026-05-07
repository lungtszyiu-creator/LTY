/**
 * 知识管理部访问权限
 *
 * 老板要求：所有 active 员工可看 + 上传文档（PendingUpload），
 * 但「召唤管家」（IngestRequest）仍仅 SUPER_ADMIN 能触发 ——
 * 召唤会跑 Claude headless ingest 全 _inbox，是高代价 + 写权限动作。
 */
import { redirect } from 'next/navigation';
import { getSession } from './auth';
import { prisma } from './db';

export type KnowledgeAccessCtx = {
  userId: string;
  isSuperAdmin: boolean;
  /** 普通员工只能上传文档（PendingUpload），不能召唤管家 */
  canSummonCurator: boolean;
};

export async function requireKnowledgeView(): Promise<KnowledgeAccessCtx> {
  const session = await getSession();
  if (!session?.user) redirect('/login?next=/knowledge');

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, active: true },
  });
  if (!dbUser?.active) redirect('/login?next=/knowledge');

  const isSuperAdmin = dbUser.role === 'SUPER_ADMIN';
  return {
    userId: dbUser.id,
    isSuperAdmin,
    canSummonCurator: isSuperAdmin,
  };
}
