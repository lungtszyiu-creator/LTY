/**
 * HR 员工档案更新端点（AI 入职后续 / 试用转正 / 离职用）
 *
 * 大多数 use case 推荐用 POST `/api/v1/hr/employee-profile` 的 upsert 模式
 * （同 userId 自动 update）。本 PATCH 仅用于已知 profile id 的精确更新场景。
 *
 * PATCH /api/v1/hr/employee-profile/:id
 *   X-Api-Key: lty_xxxx       (scope ∈ {HR_AI:hr_clerk, HR_AI:hr_onboard, HR_ADMIN})
 *   Body 字段命名跟 POST 一致（双 alias + 大小写宽松），任何字段都选填：
 *     {
 *       "position": "...", "workType": "fulltime", "location": "remote",
 *       "joinDate": "...", "status": "active",  ...
 *     }
 *
 * status='RESIGNED' / 'resigned' 时自动写 resignedAt=now；不传则不动。
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

function normEmploymentType(v: string): string | null {
  const lower = v.toLowerCase();
  const map: Record<string, string> = {
    fulltime: 'FULL_TIME',
    full_time: 'FULL_TIME',
    parttime: 'PART_TIME',
    part_time: 'PART_TIME',
    intern: 'INTERN',
    contractor: 'CONTRACTOR',
  };
  return map[lower] ?? null;
}
function normWorkLocation(v: string): string | null {
  const lower = v.toLowerCase();
  const map: Record<string, string> = { remote: 'REMOTE', onsite: 'ONSITE', on_site: 'ONSITE' };
  return map[lower] ?? null;
}
function normStatus(v: string): string | null {
  const lower = v.toLowerCase();
  const map: Record<string, string> = {
    active: 'ACTIVE',
    probation: 'PROBATION',
    resigned: 'RESIGNED',
  };
  return map[lower] ?? null;
}
function normIdType(v: string): string | null {
  const upper = v.toUpperCase();
  return ['ID_CARD', 'PASSPORT', 'WORK_PERMIT'].includes(upper) ? upper : null;
}

const patchSchema = z.object({
  department: z.string().max(100).nullable().optional(),
  position: z.string().max(100).nullable().optional(),
  positionTitle: z.string().max(100).nullable().optional(),
  workType: z.string().nullable().optional(),
  employmentType: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  workLocation: z.string().nullable().optional(),
  joinDate: z.string().nullable().optional(),
  hireDate: z.string().nullable().optional(),
  probationEnd: z.string().nullable().optional(),
  contractEnd: z.string().nullable().optional(),
  idType: z.string().nullable().optional(),
  idNumber: z.string().max(64).nullable().optional(),
  idExpireAt: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

function parseDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
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

  const data: Prisma.HrEmployeeProfileUpdateInput = {};
  if (d.department !== undefined) data.department = d.department?.trim() || null;
  const pos = d.position ?? d.positionTitle;
  if (pos !== undefined) data.positionTitle = pos?.trim() || null;

  const empRaw = d.workType ?? d.employmentType;
  if (empRaw) {
    const v = normEmploymentType(empRaw);
    if (!v)
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          hint: `workType/employmentType 值不合法：${empRaw}。接受 fulltime/parttime/intern/contractor（或大写）`,
        },
        { status: 422 },
      );
    data.employmentType = v;
  }

  const locRaw = d.location ?? d.workLocation;
  if (locRaw) {
    const v = normWorkLocation(locRaw);
    if (!v)
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          hint: `location/workLocation 值不合法：${locRaw}。接受 remote/onsite（或大写）`,
        },
        { status: 422 },
      );
    data.workLocation = v;
  }

  const hire = parseDate(d.joinDate ?? d.hireDate);
  if (hire !== undefined) data.hireDate = hire;
  const prob = parseDate(d.probationEnd);
  if (prob !== undefined) data.probationEnd = prob;
  const ctr = parseDate(d.contractEnd);
  if (ctr !== undefined) data.contractEnd = ctr;

  if (d.idType !== undefined) {
    if (d.idType === null) {
      data.idType = null;
    } else {
      const v = normIdType(d.idType);
      if (!v)
        return NextResponse.json(
          {
            error: 'VALIDATION_FAILED',
            hint: `idType 值不合法：${d.idType}。接受 ID_CARD/PASSPORT/WORK_PERMIT`,
          },
          { status: 422 },
        );
      data.idType = v;
    }
  }
  if (d.idNumber !== undefined) data.idNumber = d.idNumber?.trim() || null;
  const ide = parseDate(d.idExpireAt);
  if (ide !== undefined) data.idExpireAt = ide;
  if (d.status) {
    const v = normStatus(d.status);
    if (!v)
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          hint: `status 值不合法：${d.status}。接受 active/probation/resigned（或大写）`,
        },
        { status: 422 },
      );
    data.status = v;
    data.resignedAt = v === 'RESIGNED' ? new Date() : null;
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
        summary: `档案更新：${profile.user.name ?? profile.user.email}${d.status ? ` · 状态→${data.status}` : ''}`,
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
