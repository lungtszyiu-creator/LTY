/**
 * API Key 管理 —— 双轨权限：
 *
 * 1. SUPER_ADMIN（老板）：任意 scope 创建 / 吊销 / 看全部
 * 2. 系统 ADMIN + 部门 LEAD：仅可创建本部门 scope（如 LTY_LEGAL_AI:legal_clerk
 *    给 LTY 法务部 LEAD），创建后只能在自己部门页生成。跨部门 scope（含
 *    FINANCE_*）一律拒。`/admin/api-keys` 总管理页保留仅 SUPER_ADMIN。
 *
 * GET ?scopePrefix=ADMIN_ 等：限定查询范围。SUPER_ADMIN 可以省（看全部），
 * 其它必须传，否则 403。
 *
 * 安全设计：
 * - 创建时返回明文 key（响应里只出现一次），DB 永远只存 sha256 hash + 12 位前缀
 * - 列表接口绝不返回明文
 * - 吊销 = 设 revokedAt + active=false（保留记录用于审计）
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { generateApiKey } from '@/lib/api-auth';

/** scope 前缀 → 部门 slug。给非 SUPER_ADMIN 路径校验"本部门 scope"用。 */
const SCOPE_PREFIX_TO_DEPT_SLUG: Record<string, string> = {
  ADMIN: 'admin',
  LTY_LEGAL: 'lty-legal',
  MC_LEGAL: 'mc-legal',
  HR: 'hr',
  CASHIER: 'cashier',
};

/** scope 字符串 → 对应部门 slug；FINANCE_* / 未知 scope 返回 null（仅 SUPER_ADMIN 可发） */
function scopeToDeptSlug(scope: string): string | null {
  for (const [prefix, slug] of Object.entries(SCOPE_PREFIX_TO_DEPT_SLUG)) {
    if (
      scope === `${prefix}_ADMIN` ||
      scope === `${prefix}_READONLY` ||
      scope.startsWith(`${prefix}_AI:`)
    ) {
      return slug;
    }
  }
  return null;
}

async function getCallerCtx() {
  const session = await getSession();
  if (!session?.user) return null;
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, active: true },
  });
  if (!dbUser?.active) return null;
  return { userId: dbUser.id, role: dbUser.role as 'SUPER_ADMIN' | 'ADMIN' | 'MEMBER' };
}

export async function GET(req: NextRequest) {
  const caller = await getCallerCtx();
  if (!caller) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const scopePrefix = req.nextUrl.searchParams.get('scopePrefix');

  if (caller.role === 'SUPER_ADMIN') {
    const keys = await prisma.apiKey.findMany({
      where: scopePrefix ? { scope: { startsWith: scopePrefix } } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, keyPrefix: true, scope: true, active: true,
        lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true,
      },
    });
    return NextResponse.json({ keys });
  }

  // 非 SUPER_ADMIN 必须传 scopePrefix（防止越权扫全表）
  if (!scopePrefix) {
    return NextResponse.json(
      { error: 'SCOPE_PREFIX_REQUIRED', hint: '非总管必须传 ?scopePrefix=<DEPT>_ 限定范围' },
      { status: 403 },
    );
  }
  const targetSlug = Object.entries(SCOPE_PREFIX_TO_DEPT_SLUG).find(
    ([prefix]) => scopePrefix === `${prefix}_`,
  )?.[1];
  if (!targetSlug) {
    return NextResponse.json({ error: 'UNKNOWN_SCOPE_PREFIX' }, { status: 400 });
  }

  // 系统 ADMIN 视同所有部门 LEAD，可看任何部门 scope key
  if (caller.role === 'ADMIN') {
    const keys = await prisma.apiKey.findMany({
      where: { scope: { startsWith: scopePrefix } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, keyPrefix: true, scope: true, active: true,
        lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true,
      },
    });
    return NextResponse.json({ keys });
  }

  // MEMBER → 必须是该 dept 的 LEAD
  const dept = await prisma.department.findFirst({
    where: { slug: targetSlug, active: true },
    select: { id: true },
  });
  if (!dept) return NextResponse.json({ error: 'DEPT_NOT_FOUND' }, { status: 404 });
  const membership = await prisma.departmentMembership.findUnique({
    where: { departmentId_userId: { departmentId: dept.id, userId: caller.userId } },
    select: { role: true },
  });
  if (!membership || membership.role !== 'LEAD') {
    return NextResponse.json({ error: 'NOT_DEPT_LEAD' }, { status: 403 });
  }
  const keys = await prisma.apiKey.findMany({
    where: { scope: { startsWith: scopePrefix } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, keyPrefix: true, scope: true, active: true,
      lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true,
    },
  });
  return NextResponse.json({ keys });
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  scope: z.string().min(1).max(50),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

export async function POST(req: NextRequest) {
  const caller = await getCallerCtx();
  if (!caller) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const data = createSchema.parse(await req.json());

  // 老板任意 scope；其它必须本部门 scope + 是该部门 LEAD（系统 ADMIN 视同所有 LEAD）
  if (caller.role !== 'SUPER_ADMIN') {
    const targetSlug = scopeToDeptSlug(data.scope);
    if (!targetSlug) {
      return NextResponse.json(
        {
          error: 'CROSS_DEPT_SCOPE_FORBIDDEN',
          hint: 'FINANCE_ADMIN / FINANCE_AI:* 等跨部门 scope 仅总管可发',
        },
        { status: 403 },
      );
    }
    if (caller.role !== 'ADMIN') {
      // MEMBER 必须是该部门 LEAD
      const dept = await prisma.department.findFirst({
        where: { slug: targetSlug, active: true },
        select: { id: true },
      });
      if (!dept) return NextResponse.json({ error: 'DEPT_NOT_FOUND' }, { status: 404 });
      const membership = await prisma.departmentMembership.findUnique({
        where: { departmentId_userId: { departmentId: dept.id, userId: caller.userId } },
        select: { role: true },
      });
      if (!membership || membership.role !== 'LEAD') {
        return NextResponse.json(
          { error: 'NOT_DEPT_LEAD', hint: '只有该部门负责人能发本部门 API Key' },
          { status: 403 },
        );
      }
    }
  }

  const { plaintext, hashed, prefix } = generateApiKey();
  const expiresAt = data.expiresInDays
    ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const key = await prisma.apiKey.create({
    data: {
      name: data.name,
      hashedKey: hashed,
      keyPrefix: prefix,
      scope: data.scope,
      active: true,
      expiresAt,
      createdById: caller.userId,
    },
    select: {
      id: true, name: true, keyPrefix: true, scope: true, expiresAt: true, createdAt: true,
    },
  });

  return NextResponse.json(
    {
      ...key,
      plaintext_key: plaintext,
      _warning: '请立刻复制保存。本明文 Key 不会再出现，离开本响应后无法找回。',
    },
    { status: 201 },
  );
}
