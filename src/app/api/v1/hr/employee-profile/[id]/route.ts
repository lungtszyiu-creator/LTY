/**
 * HR 员工档案更新端点（AI 入职后续 / 试用转正 / 离职用）
 *
 * PATCH /api/v1/hr/employee-profile/:id
 *   X-Api-Key: lty_xxxx       (scope ∈ {HR_AI:hr_clerk, HR_AI:hr_onboard, HR_ADMIN})
 *   Body: 任何字段都选填；只传要改的；status='RESIGNED' 时自动写 resignedAt=now
 *
 * 用途：HR Bot 跑日常时跨场景写回看板：
 *   - 试用转正：status: 'PROBATION' → 'ACTIVE'
 *   - 离职：status: 'RESIGNED'（resignedAt 自动）
 *   - 证件续期：idExpireAt 改新值，banner 自动消失
 *   - 工位调整：workLocation / department 改
 *
 * 不允许从 PATCH 改 userId（一对一关系，要换人请删旧档案 + 建新）。
 */
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireApiKey } from '@/lib/api-auth';
import { logAiActivity } from '@/lib/ai-log';

export const dynamic = 'force-dynamic';

const ALLOWED_SCOPES = ['HR_AI:hr_clerk', 'HR_AI:hr_onboard', 'HR_ADMIN'];

const patchSchema = z.object({
  department: z.string().max(100).nullable().optional(),
  positionTitle: z.string().max(100).nullable().optional(),
  employmentType: z
    .enum(['FULL_TIME', 'PART_TIME', 'INTERN', 'CONTRACTOR'])
    .optional(),
  workLocation: z.enum(['ONSITE', 'REMOTE']).optional(),
  hireDate: z.string().nullable().optional(),
  probationEnd: z.string().nullable().optional(),
  contractEnd: z.string().nullable().optional(),
  idType: z.enum(['ID_CARD', 'PASSPORT', 'WORK_PERMIT']).nullable().optional(),
  idNumber: z.string().max(64).nullable().optional(),
  idExpireAt: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'PROBATION', 'RESIGNED']).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

function parseDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined; // 未传 = 不动
  if (v === null || v === '') return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiKey(req, ALLOWED_SCOPES);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'INVALID_JSON', hint: '请求 body 不是合法 JSON' },
      { status: 400 },
    );
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: 'VALIDATION_FAILED',
        hint: `字段 ${first?.path.join('.') ?? '?'} 不合法：${first?.message ?? '?'}`,
        issues: parsed.error.issues,
      },
      { status: 422 },
    );
  }
  const d = parsed.data;

  // 只 build 用户传了的字段（防 undefined 把已有值清空）
  const data: Prisma.HrEmployeeProfileUpdateInput = {};
  if (d.department !== undefined) data.department = d.department?.trim() || null;
  if (d.positionTitle !== undefined) data.positionTitle = d.positionTitle?.trim() || null;
  if (d.employmentType !== undefined) data.employmentType = d.employmentType;
  if (d.workLocation !== undefined) data.workLocation = d.workLocation;
  const hireDate = parseDate(d.hireDate);
  if (hireDate !== undefined) data.hireDate = hireDate;
  const probationEnd = parseDate(d.probationEnd);
  if (probationEnd !== undefined) data.probationEnd = probationEnd;
  const contractEnd = parseDate(d.contractEnd);
  if (contractEnd !== undefined) data.contractEnd = contractEnd;
  if (d.idType !== undefined) data.idType = d.idType ?? null;
  if (d.idNumber !== undefined) data.idNumber = d.idNumber?.trim() || null;
  const idExpireAt = parseDate(d.idExpireAt);
  if (idExpireAt !== undefined) data.idExpireAt = idExpireAt;
  if (d.status !== undefined) {
    data.status = d.status;
    // 状态切到离职时自动写 resignedAt；切回非离职时清空
    data.resignedAt = d.status === 'RESIGNED' ? new Date() : null;
  }
  if (d.notes !== undefined) data.notes = d.notes?.trim() || null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: 'EMPTY_PATCH', hint: '没传任何要改的字段' },
      { status: 400 },
    );
  }

  try {
    const profile = await prisma.hrEmployeeProfile.update({
      where: { id },
      data,
      select: {
        id: true,
        updatedAt: true,
        status: true,
        user: { select: { name: true, email: true } },
      },
    });

    const aiActivityLogId = await logAiActivity({
      aiRole: 'hr_onboard',
      action: 'update_hr_employee_profile',
      apiKeyId: auth.apiKeyId,
      payload: {
        summary: `档案更新：${profile.user.name ?? profile.user.email}${d.status ? ` · 状态→${d.status}` : ''}`,
        profileId: profile.id,
        changedFields: Object.keys(data),
      },
    }).catch(() => null);

    revalidatePath('/dept/hr');
    revalidatePath(`/dept/hr/employees/${profile.id}`);

    return NextResponse.json({
      ok: true,
      id: profile.id,
      updatedAt: profile.updatedAt.toISOString(),
      status: profile.status,
      aiActivityLogId,
      hint: '档案已更新；本次操作已记录到 /dept/ai 今日 AI 工作日记。',
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2025') {
        return NextResponse.json(
          { error: 'PROFILE_NOT_FOUND', hint: `id=${id} 找不到档案` },
          { status: 404 },
        );
      }
      console.error('[hr/employee-profile PATCH] prisma:', e.code, e.message);
      return NextResponse.json(
        { error: 'DB_ERROR', hint: e.message },
        { status: 500 },
      );
    }
    console.error('[hr/employee-profile PATCH] uncaught:', e);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', hint: e instanceof Error ? e.message : '?' },
      { status: 500 },
    );
  }
}
