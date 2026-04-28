/**
 * API Key 管理（仅老板/Admin 可见可创建可吊销）
 *
 * 安全设计：
 * - 创建时返回明文 key，**响应里只出现一次**，老板必须立刻复制保存
 * - DB 永远只存 sha256 hash + 12 位前缀（前缀仅用于审计识别）
 * - 列表接口绝不返回明文（已经无法返回）
 * - 吊销 = 设 revokedAt + active=false（保留记录用于审计）
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';
import { generateApiKey } from '@/lib/api-auth';

export async function GET() {
  await requireAdmin();
  const keys = await prisma.apiKey.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scope: true,
      active: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
      // 明文 hashedKey 不返回
    },
  });
  return NextResponse.json({ keys });
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  scope: z.string().min(1).max(50),  // "FINANCE_AI:voucher_clerk" | "FINANCE_ADMIN" | ...
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const data = createSchema.parse(await req.json());

  const { plaintext, hashed, prefix } = generateApiKey();
  const expiresAt = data.expiresInDays
    ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const key = await prisma.apiKey.create({
    data: {
      name: data.name,
      hashedKey: hashed,
      keyPrefix: prefix,
      scope: data.scope,
      active: true,
      expiresAt,
      createdById: admin.id,
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scope: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  // ⚠️ 明文 key 只在此次响应中出现，DB 永不存储
  return NextResponse.json(
    {
      ...key,
      plaintext_key: plaintext,
      _warning: '请立刻复制保存。本明文 Key 不会再出现，离开本响应后无法找回。',
    },
    { status: 201 },
  );
}
