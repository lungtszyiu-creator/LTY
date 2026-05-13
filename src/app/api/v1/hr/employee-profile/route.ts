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
 * POST /api/v1/hr/employee-profile     —— 创建（同 userEmail 已有档案则自动 upsert update）
 *   X-Api-Key: lty_xxxx       (scope ∈ {HR_AI:hr_clerk, HR_AI:hr_onboard, HR_ADMIN})
 *   Body（兼容 Cici manus 的字段命名 + 大小写宽松）：
 *     {
 *       // 用户身份：以下三个**至少传一个**
 *       "userId": "cuid...",         // 精确匹配
 *       "userEmail": "...@...",      // 推荐：HR 入职流程必有的工作邮箱
 *       "name": "张三",              // 兜底：按姓名查 User 表，重名时拒
 *
 *       "department": "产研部",
 *       "position": "前端工程师",    // 或 positionTitle，二选一
 *       "workType": "fulltime",      // 或 employmentType；接受 fulltime/parttime/intern/contractor
 *                                    // 也接受大写 FULL_TIME / PART_TIME / INTERN / CONTRACTOR
 *       "location": "remote",        // 或 workLocation；接受 remote/onsite 或 REMOTE/ONSITE
 *       "joinDate": "2026-05-13",    // 或 hireDate
 *       "probationEnd": "2026-08-13",
 *       "contractEnd": null,
 *       "idType": "ID_CARD",         // 接受 ID_CARD / PASSPORT / WORK_PERMIT
 *       "idNumber": "...",
 *       "idExpireAt": "2030-...",
 *       "status": "active",          // 接受 active/probation/resigned 或大写 ACTIVE/PROBATION/RESIGNED
 *       "notes": "..."
 *     }
 *
 * 行为：
 *   1. requireApiKey 校验 scope（HR_AI:hr_clerk / HR_AI:hr_onboard / HR_ADMIN）
 *   2. userId > userEmail > name 三级解析到 User
 *   3. **upsert 模式**（默认）：同 userEmail 已存在 → 自动 update 返 200，不再 409
 *      也可显式传 `mode: "create"` 强制只创建（重复返 409）
 *   4. zod schema 双 alias 兼容 Cici spec + 老 LTY spec；值大小写双接受
 *   5. revalidatePath('/dept/hr', '/dept/hr/employees') 看板实时刷新
 *   6. 顺手 logAiActivity → 自动出现在 /dept/ai 「今日 AI 工作日记」
 *
 * 返回：
 *   201 (created) / 200 (updated via upsert)
 *   { ok, id, displayedAt, aiActivityLogId, action: "created" | "updated", echo: { name } }
 *   404 USER_NOT_FOUND / 409 PROFILE_ALREADY_EXISTS (mode=create) / 422 NAME_AMBIGUOUS / VALIDATION_FAILED
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

/** 把 Cici 风格的小写 alias 值映射到 DB 枚举大写值；已经大写则原样返回 */
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
  const map: Record<string, string> = {
    remote: 'REMOTE',
    onsite: 'ONSITE',
    on_site: 'ONSITE',
  };
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

const inputSchema = z
  .object({
    // 身份
    userId: z.string().min(1).optional(),
    userEmail: z.string().email().optional(),
    name: z.string().min(1).max(80).optional(),

    // upsert 行为
    mode: z.enum(['upsert', 'create']).optional(), // 默认 upsert

    // 字段（双 alias）
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
  })
  .refine((d) => d.userId || d.userEmail || d.name, {
    message: 'userId / userEmail / name 至少传一个用于定位 User',
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

  const parsed = inputSchema.safeParse(body);
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
  const mode = d.mode ?? 'upsert';

  // ====== 1. 解析 userId（按优先级：userId > userEmail > name）======
  let userId = d.userId;
  let resolvedBy: 'userId' | 'userEmail' | 'name' | null = userId ? 'userId' : null;

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
    resolvedBy = 'userEmail';
  }

  if (!userId && d.name) {
    // 按 name 模糊匹配（精确等值；考虑大小写不敏感的话生产环境通常用 ILIKE，但 Prisma 这里走 equals）
    const candidates = await prisma.user.findMany({
      where: { name: d.name.trim() },
      select: { id: true, email: true, name: true },
      take: 5,
    });
    if (candidates.length === 0) {
      return NextResponse.json(
        {
          error: 'USER_NOT_FOUND',
          hint: `name="${d.name}" 找不到 User。先让管理员去 /admin/users 创建账号（系统不会自动建 User 防止账号失控），或本次调用同时传 userEmail。`,
        },
        { status: 404 },
      );
    }
    if (candidates.length > 1) {
      return NextResponse.json(
        {
          error: 'NAME_AMBIGUOUS',
          hint: `name="${d.name}" 匹配到 ${candidates.length} 个 User，请改用 userEmail 或 userId 精确指定。`,
          candidates: candidates.map((c) => ({ id: c.id, email: c.email, name: c.name })),
        },
        { status: 422 },
      );
    }
    userId = candidates[0].id;
    resolvedBy = 'name';
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'USER_RESOLVE_FAILED', hint: '无法解析 userId' },
      { status: 422 },
    );
  }

  // ====== 2. 统一字段（合并 alias，归一大小写）======
  const positionTitle = (d.position ?? d.positionTitle)?.trim() || null;
  const employmentTypeRaw = d.workType ?? d.employmentType;
  const workLocationRaw = d.location ?? d.workLocation;
  const hireDateRaw = d.joinDate ?? d.hireDate;

  let employmentType: string | undefined;
  if (employmentTypeRaw) {
    const v = normEmploymentType(employmentTypeRaw);
    if (!v) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          hint: `workType/employmentType 值不合法：${employmentTypeRaw}。接受 fulltime/parttime/intern/contractor（或大写 FULL_TIME 等）`,
        },
        { status: 422 },
      );
    }
    employmentType = v;
  }

  let workLocation: string | undefined;
  if (workLocationRaw) {
    const v = normWorkLocation(workLocationRaw);
    if (!v) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          hint: `location/workLocation 值不合法：${workLocationRaw}。接受 remote/onsite（或大写）`,
        },
        { status: 422 },
      );
    }
    workLocation = v;
  }

  let status: string | undefined;
  if (d.status) {
    const v = normStatus(d.status);
    if (!v) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          hint: `status 值不合法：${d.status}。接受 active/probation/resigned（或大写）`,
        },
        { status: 422 },
      );
    }
    status = v;
  }

  let idType: string | null | undefined;
  if (d.idType !== undefined) {
    if (d.idType === null) {
      idType = null;
    } else {
      const v = normIdType(d.idType);
      if (!v) {
        return NextResponse.json(
          {
            error: 'VALIDATION_FAILED',
            hint: `idType 值不合法：${d.idType}。接受 ID_CARD/PASSPORT/WORK_PERMIT（大小写均可）`,
          },
          { status: 422 },
        );
      }
      idType = v;
    }
  }

  // ====== 3. upsert 模式实现 ======
  // 同 userId 已有档案：mode=upsert 走 update，mode=create 返 409
  const existing = await prisma.hrEmployeeProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (existing && mode === 'create') {
    return NextResponse.json(
      {
        error: 'PROFILE_ALREADY_EXISTS',
        hint: '该 User 已有员工档案。改字段请用 PATCH /api/v1/hr/employee-profile/:id，或本次调用传 mode:"upsert"（默认）。',
        existingProfileId: existing.id,
      },
      { status: 409 },
    );
  }

  // 用户档案 echo 用：取 User 名 + email
  const userInfo = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });

  // 拼写入 / 更新 data
  const writeData = {
    department: d.department?.trim() || null,
    positionTitle,
    employmentType: employmentType ?? (existing ? undefined : 'FULL_TIME'),
    workLocation: workLocation ?? (existing ? undefined : 'ONSITE'),
    hireDate: parseDate(hireDateRaw),
    probationEnd: parseDate(d.probationEnd),
    contractEnd: parseDate(d.contractEnd),
    idType: idType ?? null,
    idNumber: d.idNumber?.trim() || null,
    idExpireAt: parseDate(d.idExpireAt),
    status: status ?? (existing ? undefined : 'ACTIVE'),
    notes: d.notes?.trim() || null,
    // 离职状态自动写 resignedAt（切回非离职时清空）
    resignedAt: status === 'RESIGNED' ? new Date() : status ? null : undefined,
  };

  try {
    let profile;
    let action: 'created' | 'updated';
    if (existing) {
      profile = await prisma.hrEmployeeProfile.update({
        where: { id: existing.id },
        data: writeData,
        select: { id: true, updatedAt: true, createdAt: true },
      });
      action = 'updated';
    } else {
      profile = await prisma.hrEmployeeProfile.create({
        data: {
          userId,
          ...writeData,
          // create 时必填字段不能 undefined
          employmentType: writeData.employmentType ?? 'FULL_TIME',
          workLocation: writeData.workLocation ?? 'ONSITE',
          status: writeData.status ?? 'ACTIVE',
        },
        select: { id: true, updatedAt: true, createdAt: true },
      });
      action = 'created';
    }

    const aiActivityLogId = await logAiActivity({
      aiRole: 'hr_onboard',
      action: action === 'created' ? 'create_hr_employee_profile' : 'update_hr_employee_profile',
      apiKeyId: auth.apiKeyId,
      payload: {
        summary: `${action === 'created' ? '入职建档' : '档案更新'}：${userInfo?.name ?? userInfo?.email ?? d.name ?? '?'}${positionTitle ? ` · ${positionTitle}` : ''}${d.department ? ` · ${d.department}` : ''}`,
        profileId: profile.id,
        userId,
        resolvedBy,
        action,
      },
    }).catch(() => null);

    revalidatePath('/dept/hr');
    revalidatePath('/dept/hr/employees');
    if (existing) revalidatePath(`/dept/hr/employees/${profile.id}`);

    return NextResponse.json(
      {
        ok: true,
        id: profile.id,
        action,
        resolvedBy,
        echo: { name: userInfo?.name ?? d.name, email: userInfo?.email },
        createdAt: profile.createdAt.toISOString(),
        updatedAt: profile.updatedAt.toISOString(),
        displayedAt: `/dept/hr/employees/${profile.id}`,
        aiActivityLogId,
        hint:
          action === 'created'
            ? '档案已建，/dept/hr KPI 自动刷新；本次操作已记录到 /dept/ai 今日 AI 工作日记。'
            : '档案已更新（同 userId 已有档案 → upsert），/dept/hr 实时刷新；本次操作已记录到 /dept/ai。',
      },
      { status: action === 'created' ? 201 : 200 },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      console.error('[hr/employee-profile POST] prisma:', e.code, e.message);
      return NextResponse.json(
        { error: 'DB_ERROR', code: e.code, hint: e.message },
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
