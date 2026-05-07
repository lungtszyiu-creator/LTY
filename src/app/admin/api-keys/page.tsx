/**
 * API Key 总管理页 —— 仅 SUPER_ADMIN（老板）可进。
 *
 * 老板原话："总 api 管理有危险" —— 部门 LEAD / 系统 ADMIN 不能进总管理页，
 * 他们只能在自己部门页生成本部门 scope。本页保留是因为 FINANCE_* 跨部门
 * scope 必须由老板亲自发，没地方"内嵌"。
 *
 * 实现：server component 校验 role === 'SUPER_ADMIN'，否则跳 /。
 * UI 部分（client）放 _components/ApiKeysClient.tsx。
 */
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ApiKeysClient } from './_components/ApiKeysClient';

export const dynamic = 'force-dynamic';

export default async function ApiKeyAdminPage() {
  const session = await getSession();
  if (!session?.user) redirect('/');
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, active: true },
  });
  if (!dbUser?.active || dbUser.role !== 'SUPER_ADMIN') {
    redirect('/');
  }
  return <ApiKeysClient />;
}
