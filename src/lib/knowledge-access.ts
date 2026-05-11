/**
 * 知识管理部访问权限
 *
 * 老板要求：所有 active 员工可看 + 上传文档（PendingUpload），
 * 但「召唤管家」（IngestRequest）仍仅 SUPER_ADMIN 能触发 ——
 * 召唤会跑 Claude headless ingest 全 _inbox，是高代价 + 写权限动作。
 *
 * canRouteMcLegal（2026-05-12 加）：MC vault 路由权限
 * 谁能在上传时选 🔒 MC 法务 把文件丢到 mc-legal-vault repo？
 * - SUPER_ADMIN（老板自己）
 * - LTY 法务部成员（协作 MC 法务事务，如 Maggie）
 * - MC 法务部成员（MC 法务部正式成员）
 * 其他部门员工只能传 LTY 业务，看不到 MC 选项（避免误传）。
 */
import { redirect } from 'next/navigation';
import { getSession } from './auth';
import { prisma } from './db';

export type KnowledgeAccessCtx = {
  userId: string;
  isSuperAdmin: boolean;
  /** 普通员工只能上传文档（PendingUpload），不能召唤管家 */
  canSummonCurator: boolean;
  /** 能否在上传时选 🔒 MC 法务 路由（法务相关角色 + 老板） */
  canRouteMcLegal: boolean;
};

/** 能选 MC 路由的部门 slugs：法务相关部门 */
export const MC_ROUTE_DEPT_SLUGS = ['lty-legal', 'mc-legal'];

/** 同步 API 路由也用此函数判断（不走 redirect） */
export async function userCanRouteMcLegal(userId: string): Promise<boolean> {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, active: true },
  });
  if (!dbUser?.active) return false;
  if (dbUser.role === 'SUPER_ADMIN') return true;
  const legalMembership = await prisma.departmentMembership.findFirst({
    where: {
      userId,
      department: { slug: { in: MC_ROUTE_DEPT_SLUGS } },
    },
    select: { id: true },
  });
  return legalMembership !== null;
}

export async function requireKnowledgeView(): Promise<KnowledgeAccessCtx> {
  const session = await getSession();
  if (!session?.user) redirect('/login?next=/knowledge');

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, active: true },
  });
  if (!dbUser?.active) redirect('/login?next=/knowledge');

  const isSuperAdmin = dbUser.role === 'SUPER_ADMIN';
  const canRouteMcLegal = await userCanRouteMcLegal(dbUser.id);
  return {
    userId: dbUser.id,
    isSuperAdmin,
    canSummonCurator: isSuperAdmin,
    canRouteMcLegal,
  };
}
