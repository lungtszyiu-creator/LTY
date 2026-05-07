/**
 * 批量导入：从 LTY 现有 ApiKey 表创建 AiEmployee 档案
 *
 * 老板有 5 个财务 AI 员工是 Step 1-5 上线之前就发的 ApiKey（scope 字符串
 * 形式如 FINANCE_AI:voucher_clerk），他们在 Step 1 之前没"档案"概念。本端点
 * 一次性把这些"裸 key"补上 AiEmployee 档案，让他们也能：
 *   - 在 /employees 看到状态
 *   - 调 /api/v1/token-usage 上报用量（员工档案是前提）
 *   - 撞顶自动 paused
 *
 * 鉴权：仅 SUPER_ADMIN（数据写入操作，普通 ADMIN 不放）
 *
 * 扫描逻辑：
 *   1. 找所有 active && !revoked && !expired 的 ApiKey
 *   2. 排除已经被 AiEmployee 关联的（apiKeyId 已挂）
 *   3. 排除 scope 不在 SCOPE_PRESETS 名单内的（避免误建奇怪 scope 的员工）
 *   4. 每把符合条件的 key → 建一个 AiEmployee 档案 + 关联
 *
 * 命名规则：用 scope 对应的 SCOPE_PRESETS.label（如"凭证编制员"）。同 scope
 * 多把 active key 时，第二把员工名字加 ` #2` 后缀，避免重名混淆。
 *
 * 返回创建摘要：{ created: [...], skipped: [...] }，让 UI 弹一个 toast。
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/permissions';
import { SCOPE_PRESETS } from '@/lib/scope-presets';

export const dynamic = 'force-dynamic';

/** scope 字符串 → ScopePreset (label/desc/prefix...) */
function scopeMeta(scope: string) {
  return SCOPE_PRESETS.find((p) => p.value === scope) ?? null;
}

/** scope prefix → LTY Department.slug 映射（与 scope-presets 表保持一致） */
const PREFIX_TO_DEPT_SLUG: Record<string, string> = {
  FINANCE_: 'finance',
  ADMIN_: 'admin',
  LTY_LEGAL_: 'lty-legal',
  MC_LEGAL_: 'mc-legal',
  HR_: 'hr',
  CASHIER_: 'cashier',
};

/** scope → 默认 layer（CFO/全权 = 1 总监；READONLY 不建；其他 = 3 一线） */
function defaultLayer(scope: string): number {
  if (scope.endsWith(':cfo') || scope.endsWith('_ADMIN')) return 1;
  return 3;
}

export async function POST() {
  const admin = await requireSuperAdmin();

  // 1. 扫所有未关联的 active ApiKey
  const candidates = await prisma.apiKey.findMany({
    where: {
      active: true,
      revokedAt: null,
      // expiresAt 没填 OR 还没过期
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      aiEmployee: null, // 还没挂在任何 AiEmployee 上
    },
    select: { id: true, name: true, scope: true, keyPrefix: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  // 2. 过滤：scope 必须在 SCOPE_PRESETS 名单内 + 不是 _READONLY（被动展示用，
  //    不算独立"员工"）
  const valid = candidates.filter((k) => {
    const meta = scopeMeta(k.scope);
    return meta && !k.scope.endsWith('_READONLY');
  });

  if (valid.length === 0) {
    return NextResponse.json({
      ok: true,
      created: [],
      skipped: candidates.map((k) => ({
        keyId: k.id,
        scope: k.scope,
        reason: scopeMeta(k.scope) ? '_READONLY 不创建员工' : 'scope 不在预设名单内',
      })),
      message: '没有可导入的 ApiKey。',
    });
  }

  // 3. 同 scope 多把 key 时给员工名字加序号，避免重名
  const seenScope = new Map<string, number>();
  const created: { keyId: string; employeeId: string; name: string; scope: string }[] = [];

  for (const k of valid) {
    const meta = scopeMeta(k.scope)!;
    const idx = (seenScope.get(k.scope) ?? 0) + 1;
    seenScope.set(k.scope, idx);
    const employeeName = idx === 1 ? meta.label : `${meta.label} #${idx}`;
    const deptSlug = PREFIX_TO_DEPT_SLUG[meta.prefix] ?? null;

    const employee = await prisma.aiEmployee.create({
      data: {
        name: employeeName,
        role: meta.desc.length > 80 ? meta.desc.slice(0, 77) + '...' : meta.desc,
        deptSlug,
        layer: defaultLayer(k.scope),
        apiKeyId: k.id,
        // dailyLimitHkd 用 schema 默认 (100 HKD)
      },
      select: { id: true, name: true },
    });

    // 写一行 audit log
    await prisma.aiActivityLog.create({
      data: {
        aiRole: 'system',
        action: 'import_employee_from_key',
        status: 'success',
        apiKeyId: k.id,
        payload: JSON.stringify({
          employeeId: employee.id,
          employeeName: employee.name,
          fromKeyName: k.name,
          fromKeyPrefix: k.keyPrefix,
          scope: k.scope,
          deptSlug,
          importedBy: admin.id,
        }),
        dashboardWritten: true,
      },
    });

    created.push({
      keyId: k.id,
      employeeId: employee.id,
      name: employee.name,
      scope: k.scope,
    });
  }

  const skipped = candidates
    .filter((k) => !valid.some((v) => v.id === k.id))
    .map((k) => ({
      keyId: k.id,
      scope: k.scope,
      reason: scopeMeta(k.scope) ? '_READONLY 不创建员工' : 'scope 不在预设名单内',
    }));

  return NextResponse.json({
    ok: true,
    created,
    skipped,
    message: `导入 ${created.length} 个 AI 员工档案${skipped.length ? `，跳过 ${skipped.length} 把` : ''}。`,
  });
}
