/**
 * API Key 认证中间件
 *
 * 用于 /api/finance/* 等接受外部 AI（Coze / n8n / 脚本）调用的端点。
 * 与 NextAuth session 并存：人类登录走 session，AI/外部服务走 API Key。
 *
 * Header: x-api-key: <full_key>
 *
 * Key 存储：
 * - 创建时生成 lty_<32-char-secret>，明文只在创建响应里返回一次
 * - DB 里只存 sha256(key) → ApiKey.hashedKey
 * - keyPrefix 存前 12 位（"lty_xxxxxxxx"）用于审计日志识别，本身无法用于认证
 *
 * Scope 字符串约定（细颗粒权限）：
 * - "FINANCE_AI:voucher_clerk"     → 只能写凭证草稿
 * - "FINANCE_AI:chain_bookkeeper"  → 只能写链上交易
 * - "FINANCE_AI:forex_lookout"     → 只能写汇率
 * - "FINANCE_AI:reconciler"        → 只能写对账
 * - "FINANCE_AI:cfo"               → 全财务读 + 部分写
 * - "FINANCE_ADMIN"                → 老板用：全财务读写
 * - "FINANCE_READONLY"             → 看板自动展示用
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from './db';

export type ApiKeyContext = {
  apiKeyId: string;
  scope: string;
  keyName: string;
};

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): { plaintext: string; hashed: string; prefix: string } {
  const secret = crypto.randomBytes(24).toString('base64url'); // 32 chars URL-safe
  const plaintext = `lty_${secret}`;
  return {
    plaintext,
    hashed: hashApiKey(plaintext),
    prefix: plaintext.slice(0, 12), // "lty_xxxxxxxx"
  };
}

/**
 * 校验请求中的 x-api-key header。
 * 返回 ApiKeyContext 或抛出 NextResponse 错误。
 *
 * 用法（在 route.ts 内）：
 *   const ctx = await requireApiKey(req, ['FINANCE_AI:voucher_clerk', 'FINANCE_ADMIN']);
 *   // ctx.scope, ctx.apiKeyId 可用
 */
export async function requireApiKey(
  req: NextRequest,
  allowedScopes: string[],
): Promise<ApiKeyContext> {
  const headerKey = req.headers.get('x-api-key');
  if (!headerKey) {
    throw NextResponse.json({ error: 'API_KEY_MISSING' }, { status: 401 });
  }

  const hashed = hashApiKey(headerKey);
  const apiKey = await prisma.apiKey.findUnique({ where: { hashedKey: hashed } });

  if (!apiKey || !apiKey.active || apiKey.revokedAt) {
    throw NextResponse.json({ error: 'API_KEY_INVALID_OR_REVOKED' }, { status: 401 });
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    throw NextResponse.json({ error: 'API_KEY_EXPIRED' }, { status: 401 });
  }

  // Scope 校验：允许列表里要么含本 key 的精确 scope，要么含 "FINANCE_ADMIN"（superuser scope）
  const scopeAllowed = allowedScopes.includes(apiKey.scope) || apiKey.scope === 'FINANCE_ADMIN';
  if (!scopeAllowed) {
    throw NextResponse.json(
      { error: 'API_KEY_SCOPE_DENIED', required: allowedScopes, actual: apiKey.scope },
      { status: 403 },
    );
  }

  // Touch lastUsedAt 异步（不等）— 节省响应延迟
  prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(
    () => undefined,
  );

  return {
    apiKeyId: apiKey.id,
    scope: apiKey.scope,
    keyName: apiKey.name,
  };
}

/**
 * 双轨认证：要么 NextAuth session（人类），要么 API Key（AI）。
 * 用于既要给老板看也要给 AI 写的端点（如 /api/finance/vouchers）。
 */
export async function requireAuthOrApiKey(
  req: NextRequest,
  allowedScopes: string[],
): Promise<{ kind: 'session'; userId: string } | { kind: 'apikey'; ctx: ApiKeyContext }> {
  const headerKey = req.headers.get('x-api-key');
  if (headerKey) {
    const ctx = await requireApiKey(req, allowedScopes);
    return { kind: 'apikey', ctx };
  }

  // 没有 API Key → 走 session
  const { getSession } = await import('./auth');
  const session = await getSession();
  if (!session?.user || !session.user.active) {
    throw NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  return { kind: 'session', userId: session.user.id };
}
