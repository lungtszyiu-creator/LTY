/**
 * LTY 法务 AI 输出审核 endpoint
 *
 * POST /dept/lty-legal/api/ai-output-review
 *   Body: { id: string, action: 'approve' | 'reject', note?: string }
 *
 * 由 AiOutputDetail client component 调用（按钮 → fetch POST）。
 * 鉴权：session + 必须 LTY 法务部 LEAD 或 SUPER_ADMIN。
 * 校验 AiOutput.deptSlug === 'lty-legal' 防越权审 MC 输出。
 */
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireDeptEdit } from '@/lib/dept-access';
import { approveAiOutput, rejectAiOutput } from '@/lib/ai-output-review';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  id: z.string().min(1),
  action: z.enum(['approve', 'reject']),
  note: z.string().max(2000).nullable().optional(),
});

export async function POST(req: NextRequest) {
  // 1. session + 部门 EDIT 权限
  let ctx;
  try {
    ctx = await requireDeptEdit('lty-legal');
  } catch (e) {
    return NextResponse.json(
      { error: 'AUTH_REQUIRED', hint: e instanceof Error ? e.message : '需登入 + LTY 法务部 LEAD 或老板' },
      { status: 403 },
    );
  }

  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 });
  }

  // 2. body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', hint: parsed.error.issues[0]?.message },
      { status: 422 },
    );
  }
  const { id, action, note } = parsed.data;

  // 3. 校验 AiOutput 属于本部门（防越权审 MC）
  const row = await prisma.aiOutput.findUnique({
    where: { id },
    select: { id: true, deptSlug: true },
  });
  if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (row.deptSlug !== 'lty-legal') {
    return NextResponse.json(
      {
        error: 'CROSS_DEPT_FORBIDDEN',
        hint: `本端点仅审 lty-legal 的 AI 输出；该记录 dept=${row.deptSlug}`,
      },
      { status: 403 },
    );
  }

  // 4. 拿 reviewer 名字
  const reviewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true },
  });
  const reviewerName = reviewer?.name ?? reviewer?.email ?? session.user.id;

  // 5. 调 helper
  const result =
    action === 'approve'
      ? await approveAiOutput({
          aiOutputId: id,
          reviewerId: session.user.id,
          reviewerName,
          reviewNote: note ?? null,
        })
      : await rejectAiOutput({
          aiOutputId: id,
          reviewerId: session.user.id,
          reviewerName,
          reviewNote: note ?? '',
        });

  if (!result.ok) {
    return NextResponse.json(
      { error: 'REVIEW_FAILED', hint: result.error },
      { status: 400 },
    );
  }

  revalidatePath('/dept/lty-legal');
  // 引用 ctx 避免 lint unused
  void ctx;
  // result 已含 ok:true（成功支路），直接 spread；上面非 ok 路径已 return
  return NextResponse.json(result);
}
