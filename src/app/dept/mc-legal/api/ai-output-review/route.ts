/**
 * MC 法务 AI 输出审核 endpoint（与 LTY 镜像，物理隔离）
 *
 * POST /dept/mc-legal/api/ai-output-review
 *
 * 鉴权：session + MC 法务部 LEAD 或 SUPER_ADMIN。
 * AiOutput.deptSlug 必须 === 'mc-legal'，防越权审 LTY。
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
  let ctx;
  try {
    ctx = await requireDeptEdit('mc-legal');
  } catch (e) {
    return NextResponse.json(
      { error: 'AUTH_REQUIRED', hint: e instanceof Error ? e.message : '需登入 + MC 法务部 LEAD 或老板' },
      { status: 403 },
    );
  }
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 });
  }
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
  const row = await prisma.aiOutput.findUnique({
    where: { id },
    select: { id: true, deptSlug: true },
  });
  if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (row.deptSlug !== 'mc-legal') {
    return NextResponse.json(
      {
        error: 'CROSS_DEPT_FORBIDDEN',
        hint: `本端点仅审 mc-legal 的 AI 输出；该记录 dept=${row.deptSlug}`,
      },
      { status: 403 },
    );
  }
  const reviewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true },
  });
  const reviewerName = reviewer?.name ?? reviewer?.email ?? session.user.id;
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
    return NextResponse.json({ error: 'REVIEW_FAILED', hint: result.error }, { status: 400 });
  }
  revalidatePath('/dept/mc-legal');
  void ctx;
  return NextResponse.json(result);
}
