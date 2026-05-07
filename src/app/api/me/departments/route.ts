/**
 * GET /api/me/departments —— 当前 session 用户能访问的部门列表
 * Nav 的"部门"下拉用这个数据渲染。
 */
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listAccessibleDepartments } from '@/lib/dept-access';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ departments: [] });
  }
  const departments = await listAccessibleDepartments(
    session.user.id,
    session.user.role ?? 'MEMBER',
  );
  return NextResponse.json({ departments });
}
