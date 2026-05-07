/**
 * 通用部门看板访问权限 helper
 *
 * 设计：
 * - 一个 LTY 主看板嵌入多个部门看板（/dept/<slug>），每部门权限独立
 * - 老板（SUPER_ADMIN）自动放行所有部门
 * - 普通用户必须在 DepartmentMembership 表里有 (departmentId, userId)
 *   才能访问该部门看板，role=LEAD/MEMBER 当前都按"可读可写"处理
 *   （阶段 1 简化；后续要细分时往这里加 EDITOR/VIEWER 维度）
 *
 * 用法：
 *   const dept = await requireDeptView('admin');           // RSC page
 *   const dept = await requireDeptEdit('admin');           // RSC page，写动作
 *   const auth = await requireDeptAuthOrApiKey(req,        // route handler
 *     'admin', ['ADMIN_AI:license_clerk', 'ADMIN_ADMIN'], 'EDIT');
 *
 * 跟现有 finance-access.ts 的关系：
 *   /finance 走自己的 financeRole 字段（先保留兼容，没迁过来）。
 *   新部门一律走 DepartmentMembership，等财务也能切到这套时再统一。
 */
import { redirect } from 'next/navigation';
import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from './auth';
import { prisma } from './db';
import { requireApiKey, type ApiKeyContext } from './api-auth';

export type DeptAccessLevel = 'NONE' | 'MEMBER' | 'LEAD' | 'SUPER_ADMIN';

export interface DeptCtx {
  userId: string;
  level: 'MEMBER' | 'LEAD' | 'SUPER_ADMIN';
  isSuperAdmin: boolean;
  /** 部门 DB 记录（slug 已校验存在） */
  department: { id: string; name: string; slug: string };
}

/**
 * 服务端组件用：要求至少 MEMBER 级别能看部门看板。
 * 不够 → redirect /dashboard（不暴露部门存在）。
 */
export async function requireDeptView(slug: string): Promise<DeptCtx> {
  const session = await getSession();
  if (!session?.user) redirect(`/login?next=/dept/${slug}`);

  const dept = await prisma.department.findFirst({
    where: { slug, active: true },
    select: { id: true, name: true, slug: true },
  });
  // 部门不存在 → 看板根本没建 → 跳 dashboard 别露
  if (!dept) redirect('/dashboard');

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, active: true },
  });
  if (!dbUser?.active) redirect(`/login?next=/dept/${slug}`);

  if (dbUser.role === 'SUPER_ADMIN') {
    return {
      userId: dbUser.id,
      level: 'SUPER_ADMIN',
      isSuperAdmin: true,
      department: dept,
    };
  }

  const membership = await prisma.departmentMembership.findUnique({
    where: { departmentId_userId: { departmentId: dept.id, userId: dbUser.id } },
    select: { role: true },
  });
  if (!membership) redirect('/dashboard');

  return {
    userId: dbUser.id,
    level: membership.role === 'LEAD' ? 'LEAD' : 'MEMBER',
    isSuperAdmin: false,
    department: dept,
  };
}

/**
 * 服务端组件用：要求 LEAD 或 SUPER_ADMIN 才能写部门数据。
 * 阶段 1 简化：MEMBER 只能读，LEAD + SUPER_ADMIN 可写。
 * 注意：阶段 1 老板说"权限不限死，根据层级随时调改"——后续可往细分。
 */
export async function requireDeptEdit(slug: string): Promise<DeptCtx> {
  const ctx = await requireDeptView(slug);
  if (ctx.level === 'MEMBER') {
    redirect(`/dept/${slug}`); // 普通成员点了写按钮 → 退回看板首页
  }
  return ctx;
}

/**
 * Route handler 双轨认证：人类 session OR API Key。
 * Session 路径：MEMBER/LEAD/SUPER_ADMIN 都允许，requiredLevel='EDIT' 时需 LEAD+。
 * API Key 路径：scope 必须在 allowedScopes 内，或者是该部门的 _ADMIN scope。
 */
export async function requireDeptAuthOrApiKey(
  req: NextRequest,
  slug: string,
  allowedScopes: string[],
  requiredLevel: 'VIEW' | 'EDIT' = 'VIEW',
): Promise<
  | { kind: 'session'; userId: string; level: 'MEMBER' | 'LEAD' | 'SUPER_ADMIN'; departmentId: string }
  | { kind: 'apikey'; ctx: ApiKeyContext; departmentId: string }
  | NextResponse
> {
  const dept = await prisma.department.findFirst({
    where: { slug, active: true },
    select: { id: true, slug: true },
  });
  if (!dept) {
    return NextResponse.json({ error: 'DEPT_NOT_FOUND' }, { status: 404 });
  }

  const headerKey = req.headers.get('x-api-key');
  if (headerKey) {
    // 部门级 _ADMIN scope（如 'ADMIN_ADMIN'）总能通过
    const slugUpper = slug.toUpperCase().replace(/-/g, '_');
    const deptAdminScope = `${slugUpper}_ADMIN`;
    const result = await requireApiKey(req, [...allowedScopes, deptAdminScope]);
    if (result instanceof NextResponse) return result;
    return { kind: 'apikey', ctx: result, departmentId: dept.id };
  }

  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, active: true },
  });
  if (!dbUser?.active) {
    return NextResponse.json({ error: 'INACTIVE' }, { status: 403 });
  }

  if (dbUser.role === 'SUPER_ADMIN') {
    return { kind: 'session', userId: dbUser.id, level: 'SUPER_ADMIN', departmentId: dept.id };
  }

  const membership = await prisma.departmentMembership.findUnique({
    where: { departmentId_userId: { departmentId: dept.id, userId: dbUser.id } },
    select: { role: true },
  });
  if (!membership) {
    return NextResponse.json({ error: 'DEPT_FORBIDDEN' }, { status: 404 }); // 404 不暴露
  }
  if (requiredLevel === 'EDIT' && membership.role !== 'LEAD') {
    return NextResponse.json({ error: 'WRITE_FORBIDDEN' }, { status: 403 });
  }

  return {
    kind: 'session',
    userId: dbUser.id,
    level: membership.role === 'LEAD' ? 'LEAD' : 'MEMBER',
    departmentId: dept.id,
  };
}

/**
 * 给 Nav / overview 列出"用户能看的部门"。
 * SUPER_ADMIN → 全部 active 部门；其他 → 自己有 membership 的。
 */
export async function listAccessibleDepartments(userId: string, userRole: string) {
  if (userRole === 'SUPER_ADMIN') {
    return prisma.department.findMany({
      where: { active: true },
      orderBy: { order: 'asc' },
      select: { id: true, name: true, slug: true, description: true },
    });
  }
  const memberships = await prisma.departmentMembership.findMany({
    where: { userId },
    include: {
      department: {
        select: { id: true, name: true, slug: true, description: true, active: true, order: true },
      },
    },
  });
  return memberships
    .filter((m) => m.department.active)
    .sort((a, b) => a.department.order - b.department.order)
    .map((m) => ({
      id: m.department.id,
      name: m.department.name,
      slug: m.department.slug,
      description: m.department.description,
    }));
}
