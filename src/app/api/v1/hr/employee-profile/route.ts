/**
 * HR 员工档案 AI 写入端点
 *
 * 老板 5/13：HR Bot（旭珑人事主管 AI）想在员工入职到岗后自动在 /dept/hr 建档，
 * 同步刷新 KPI（在职 / 远程 / 坐班 / 部门人数）—— 不需要 HR 手动登录。
 * /dept/hr/employees 现在用 Next.js Server Action，AI 拿 X-Api-Key 调不通。
 *
 * 这是「AI 把工作成果实际落到看板对应位置」这个 paradigm 的第一个具体落地。
 * 后续 行政 / 法务 / 财务 各部门按同样模式开类似端点。
 *
 * POST /api/v1/hr/employee-profile
 *   X-Api-Key: lty_xxxx       (scope ∈ {HR_AI:hr_clerk, HR_AI:hr_onboard, HR_ADMIN})
 *   Body:
 *     {
 *       "userId": "cuid..." | "userEmail": "..." ,   // 二选一必填，先确保 User 存在
 *       "department": "营销部",                       // 选填
 *       "positionTitle": "市场专员",                  // 选填
 *       "employmentType": "FULL_TIME" | "PART_TIME" | "INTERN" | "CONTRACTOR",
 *       "workLocation": "ONSITE" | "REMOTE",
 *       "hireDate": "2026-05-13",                    // YYYY-MM-DD
 *       "probationEnd": "2026-08-13",
 *       "contractEnd": null,
 *       "idType": "ID_CARD" | "PASSPORT" | "WORK_PERMIT",
 *       "idNumber": "...",
 *       "idExpireAt": "2030-...",
 *       "status": "ACTIVE" | "PROBATION" | "RESIGNED",
 *       "notes": "..."
 *     }
 *
 * 行为：
 *   1. requireApiKey 校验 scope（HR_AI:hr_clerk / HR_AI:hr_onboard / HR_ADMIN）
 *   2. userId 或 userEmail 至少一个；userEmail 优先解析到 userId
 *   3. 校验 User 存在 + 没有重复 HrEmployeeProfile（userId 唯一约束）
 *   4. zod 校验跟现有 Server Action profileSchema 对齐
 *   5. 写 HrEmployeeProfile + revalidatePath('/dept/hr', '/dept/hr/employees')
 *   6. 顺手 logAiActivity → 自动出现在 /dept/ai 「今日 AI 工作日记」
 *
 * 返回：
 *   201 { ok: true, id, displayedAt: "/dept/hr/employees/<id>", aiActivityLogId }
 *   404 USER_NOT_FOUND / 409 PROFILE_ALREADY_EXISTS / 422 VALIDATION_FAILED
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

const profileWriteSchema = z
  .object({
    userId: z.string().min(1).optional(),
    userEmail: z.string().email().optional(),
    department: z.string().max(100).nullable().optional(),
    positionTitle: z.string().max(100).nullable().optional(),
    employmentType: z
      .enum(['FULL_TIME', 'PART_TIME', 'INTERN', 'CONTRACTOR'])
      .default('FULL_TIME'),
    workLocation: z.enum(['ONSITE', 'REMOTE']).default('ONSITE'),
    hireDate: z.string().nullable().optional(),
    probationEnd: z.string().nullable().optional(),
    contractEnd: z.string().nullable().optional(),
    idType: z.enum(['ID_CARD', 'PASSPORT', 'WORK_PERMIT']).nullable().optional(),
    idNumber: z.string().max(64).nullable().optional(),
    idExpireAt: z.string().nullable().optional(),
    status: z.enum(['ACTIVE', 'PROBATION', 'RESIGNED']).default('ACTIVE'),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((d) => d.userId || d.userEmail, {
    message: 'userId 或 userEmail 至少要传一个',
    path: ['userId'],
  });

function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiKey(req, ALLOWED_SCOPES);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'INVALID_JSON', hint: '请求 body 不是合法 JSON' },
      { status: 400 },
    );
  }

  const parsed = profileWriteSchema.safeParse(body);
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

  // userEmail → userId 解析（先查 User 表）
  let userId = d.userId;
  if (!userId && d.userEmail) {
    const u = await prisma.user.findUnique({
      where: { email: d.userEmail },
      select: { id: true },
    });
    if (!u) {
      return NextResponse.json(
        {
          error: 'USER_NOT_FOUND',
          hint: `email=${d.userEmail} 找不到 User。先让管理员去 /admin/users 创建账号，再调本接口建档。`,
        },
        { status: 404 },
      );
    }
    userId = u.id;
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'USER_RESOLVE_FAILED', hint: '无法解析 userId' },
      { status: 422 },
    );
  }

  // userId 存在性校验
  const userExists = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
  if (!userExists) {
    return NextResponse.json(
      { error: 'USER_NOT_FOUND', hint: `userId=${userId} 不存在` },
      { status: 404 },
    );
  }

  try {
    const profile = await prisma.hrEmployeeProfile.create({
      data: {
        userId,
        department: d.department?.trim() || null,
        positionTitle: d.positionTitle?.trim() || null,
        employmentType: d.employmentType,
        workLocation: d.workLocation,
        hireDate: parseDate(d.hireDate),
        probationEnd: parseDate(d.probationEnd),
        contractEnd: parseDate(d.contractEnd),
        idType: d.idType ?? null,
        idNumber: d.idNumber?.trim() || null,
        idExpireAt: parseDate(d.idExpireAt),
        status: d.status,
        notes: d.notes?.trim() || null,
      },
      select: { id: true, createdAt: true },
    });

    // 看板透明文化：HR Bot 写入也算一次"工作成果"，落到 /dept/ai 工作日记
    const aiActivityLogId = await logAiActivity({
      aiRole: 'hr_onboard',
      action: 'create_hr_employee_profile',
      apiKeyId: auth.apiKeyId,
      payload: {
        summary: `入职建档：${userExists.name ?? userExists.email}${d.positionTitle ? ` · ${d.positionTitle}` : ''}${d.department ? ` · ${d.department}` : ''}`,
        profileId: profile.id,
        userId,
        status: d.status,
      },
    }).catch(() => null); // log 失败不阻塞主路径

    // 触发 /dept/hr 看板数字 + 列表实时更新
    revalidatePath('/dept/hr');
    revalidatePath('/dept/hr/employees');

    return NextResponse.json(
      {
        ok: true,
        id: profile.id,
        createdAt: profile.createdAt.toISOString(),
        displayedAt: `/dept/hr/employees/${profile.id}`,
        aiActivityLogId,
        hint: '档案已建，/dept/hr KPI 自动刷新；本次操作已记录到 /dept/ai 今日 AI 工作日记。',
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002 唯一约束冲突 = 该 User 已有档案
      if (e.code === 'P2002') {
        const existing = await prisma.hrEmployeeProfile.findUnique({
          where: { userId },
          select: { id: true },
        });
        return NextResponse.json(
          {
            error: 'PROFILE_ALREADY_EXISTS',
            hint: '该 User 已有员工档案。要改字段请用 PATCH /api/v1/hr/employee-profile/:id',
            existingProfileId: existing?.id ?? null,
          },
          { status: 409 },
        );
      }
      console.error('[hr/employee-profile POST] prisma:', e.code, e.message);
      return NextResponse.json(
        { error: 'DB_ERROR', hint: e.message },
        { status: 500 },
      );
    }
    console.error('[hr/employee-profile POST] uncaught:', e);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', hint: e instanceof Error ? e.message : '?' },
      { status: 500 },
    );
  }
}
