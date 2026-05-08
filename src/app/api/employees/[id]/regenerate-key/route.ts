/**
 * 重新生成 AI 员工的 API Key
 *
 * POST /api/employees/[id]/regenerate-key
 *   仅 SUPER_ADMIN — 这是 destructive 动作（旧 key 立刻失效，AI 调用会 401）
 *
 * 流程:
 *   1. 找员工 + 旧 ApiKey
 *   2. 旧 ApiKey revoke (active=false, revokedAt=now, revokedById=admin.id)
 *   3. generateApiKey() 生成新 plaintext + hashed + prefix
 *   4. 创建新 ApiKey 行（沿用旧 scope，name 加 "重置 yyyy-MM-dd" 后缀）
 *   5. 更新 employee.apiKeyId 指向新 key
 *   6. 写 AiActivityLog action="regenerate_api_key" 留痕
 *   7. 返回 plaintext 一次性（看板永远不存明文）
 *
 * 业务理由：老板生成 key 时没保存明文（看板只存 hash 不能回显），加这条
 * 路径让老板按一下就拿新 key，不用删员工重建。旧 key 自动 revoke 防止
 * 重置后老 key 还能用造成混乱。
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/permissions';
import { generateApiKey } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const admin = await requireSuperAdmin();

  const employee = await prisma.aiEmployee.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      apiKeyId: true,
      apiKey: { select: { id: true, name: true, scope: true } },
    },
  });
  if (!employee) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  // 沿用旧 key 的 scope；如果员工没旧 key（异常情况）默认 AI_EMPLOYEE:default
  const oldScope = employee.apiKey?.scope ?? 'AI_EMPLOYEE:default';
  const oldName = employee.apiKey?.name ?? employee.name;
  const today = new Date().toISOString().slice(0, 10);
  const newName = `${oldName.replace(/ - 重置 \d{4}-\d{2}-\d{2}.*$/, '')} - 重置 ${today}`;

  const { plaintext, hashed, prefix } = generateApiKey();

  // 事务：revoke 旧 + 创建新 + 更新员工 + 写 log
  const result = await prisma.$transaction(async (tx) => {
    // 1. 旧 key revoke（如果有）
    if (employee.apiKeyId) {
      await tx.apiKey.update({
        where: { id: employee.apiKeyId },
        data: {
          active: false,
          revokedAt: new Date(),
          revokedById: admin.id,
        },
      });
    }

    // 2. 创建新 ApiKey
    const newKey = await tx.apiKey.create({
      data: {
        name: newName,
        hashedKey: hashed,
        keyPrefix: prefix,
        scope: oldScope,
        active: true,
        createdById: admin.id,
      },
      select: { id: true, keyPrefix: true, scope: true },
    });

    // 3. 员工挂新 key
    await tx.aiEmployee.update({
      where: { id: employee.id },
      data: { apiKeyId: newKey.id },
    });

    // 4. audit log
    await tx.aiActivityLog.create({
      data: {
        aiRole: 'system',
        action: 'regenerate_api_key',
        status: 'success',
        apiKeyId: newKey.id,
        payload: JSON.stringify({
          employeeId: employee.id,
          employeeName: employee.name,
          oldKeyId: employee.apiKeyId,
          newKeyId: newKey.id,
          newKeyPrefix: newKey.keyPrefix,
          scope: oldScope,
          regeneratedBy: admin.id,
        }),
        dashboardWritten: true,
      },
    });

    return newKey;
  });

  return NextResponse.json(
    {
      ok: true,
      plaintext_key: plaintext,
      apiKey: {
        id: result.id,
        keyPrefix: result.keyPrefix,
        scope: result.scope,
      },
      employee: { id: employee.id, name: employee.name },
      _warning: '请立刻复制保存。本明文 Key 不会再出现，离开本响应后无法找回。旧 key 已自动失效。',
    },
    { status: 201 },
  );
}
