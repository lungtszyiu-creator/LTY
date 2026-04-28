/**
 * 财务模块访问权限
 *
 * 设计原则：
 * - 默认拒绝（financeRole = null）—— 大多数员工连 /finance 都看不到
 * - 老板自动放行（role === 'SUPER_ADMIN' 自动等同 EDITOR）
 * - 出纳手动赋 VIEWER —— 老板在 /admin/finance/access 操作
 * - EDITOR / VIEWER 区别：写操作（创建凭证 / 改钱包等）只允许 EDITOR
 */
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { getSession } from './auth';
import { prisma } from './db';

export type FinanceAccessLevel = 'NONE' | 'VIEWER' | 'EDITOR';

export type SessionUserMin = {
  id: string;
  role?: string | null;
  financeRole?: string | null;
};

export function financeAccessLevel(user: SessionUserMin | null | undefined): FinanceAccessLevel {
  if (!user) return 'NONE';
  if (user.role === 'SUPER_ADMIN') return 'EDITOR'; // 老板自动放行
  if (user.financeRole === 'EDITOR') return 'EDITOR';
  if (user.financeRole === 'VIEWER') return 'VIEWER';
  return 'NONE';
}

/**
 * 服务端组件 / Page 用：要求至少 VIEWER 权限。
 * 不够 → 直接 redirect 到首页（不暴露页面存在）。
 */
export async function requireFinanceView(): Promise<{
  userId: string;
  level: 'VIEWER' | 'EDITOR';
}> {
  const session = await getSession();
  if (!session?.user) redirect('/login?next=/finance');

  // session 里可能没有 financeRole，需补查 DB
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, financeRole: true, active: true },
  });
  if (!dbUser?.active) redirect('/login?next=/finance');

  const level = financeAccessLevel(dbUser);
  if (level === 'NONE') {
    // 不暴露页面存在 — 跳回任务首页（看起来像菜单根本没"财务"项）
    redirect('/dashboard');
  }
  return { userId: dbUser.id, level: level as 'VIEWER' | 'EDITOR' };
}

/**
 * 服务端组件用：要求 EDITOR（管理财务的人，如老板）。
 */
export async function requireFinanceEdit(): Promise<{ userId: string }> {
  const { userId, level } = await requireFinanceView();
  if (level !== 'EDITOR') {
    redirect('/finance'); // 出纳点了写入按钮 → 退回只读页
  }
  return { userId };
}

/**
 * Route handler 用：成功返回 {userId, level}，失败返回 NextResponse（**不再 throw**）。
 *
 * 注意：本 helper 只针对 session 路径。API Key 路径已在 requireApiKey 内通过 scope 限制。
 */
export async function requireFinanceViewSession(): Promise<
  { userId: string; level: 'VIEWER' | 'EDITOR' } | NextResponse
> {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, financeRole: true, active: true },
  });
  if (!dbUser?.active) {
    return NextResponse.json({ error: 'INACTIVE' }, { status: 403 });
  }

  const level = financeAccessLevel(dbUser);
  if (level === 'NONE') {
    return NextResponse.json({ error: 'FINANCE_FORBIDDEN' }, { status: 404 }); // 404 而非 403：不暴露存在
  }
  return { userId: dbUser.id, level: level as 'VIEWER' | 'EDITOR' };
}

export async function requireFinanceEditSession(): Promise<{ userId: string } | NextResponse> {
  const result = await requireFinanceViewSession();
  if (result instanceof NextResponse) return result;
  if (result.level !== 'EDITOR') {
    return NextResponse.json({ error: 'WRITE_FORBIDDEN' }, { status: 403 });
  }
  return { userId: result.userId };
}
