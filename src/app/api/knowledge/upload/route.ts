/**
 * 看板 → Vercel Blob 客户端直传链路
 *
 * 流程：
 * 1. 前端调用 @vercel/blob/client 的 upload()，给 handleUploadUrl = '/api/knowledge/upload'
 * 2. 本路由两段式响应：
 *    - 第一次（onBeforeGenerateToken）：鉴权 + 配置 token，返回给前端
 *    - 前端拿 token 直传到 Vercel Blob CDN（不经过本服务器，绕过 4.5MB body 限制）
 *    - 第二次（onUploadCompleted webhook）：Vercel 通知我们上传完了，写一行 PendingUpload 进 DB
 * 3. Mac 端 BlobSync 线程轮询 /api/knowledge/upload/pending 拉走文件
 *
 * 鉴权：onBeforeGenerateToken 走 NextAuth session，必须 SUPER_ADMIN。
 */
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 200 * 1024 * 1024; // 200 MB 上限，避免误传录像之类

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,

      // 鉴权 + 配置 token（前端 upload() 会先打这个）
      onBeforeGenerateToken: async (_pathname /* string */, clientPayload /* string|null */) => {
        const session = await getSession();
        if (!session?.user) {
          throw new Error('UNAUTHORIZED: 必须登入');
        }
        const dbUser = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { id: true, role: true, active: true },
        });
        // 老板要求：所有 active 员工都可上传文档（PendingUpload）。
        // 召唤管家（IngestRequest）仍仅 SUPER_ADMIN，那道闸在 /api/knowledge/ingest。
        if (!dbUser?.active) {
          throw new Error('FORBIDDEN: 账号未激活');
        }

        // 解析前端 payload（含原始 filename + 老板手填的 description）
        const meta = clientPayload ? JSON.parse(clientPayload) : {};
        // description 截断到 1000 字，防恶意大 payload
        const description: string | null =
          typeof meta.description === 'string' && meta.description.trim()
            ? meta.description.trim().slice(0, 1000)
            : null;

        // targetVault：决定文件最终落到哪个 vault repo
        // - lty-vault（默认）：所有 active 员工可传 LTY 业务文件
        // - mc-legal-vault：MC 法务部独立仓库，仅 SUPER_ADMIN + 法务部（lty-legal / mc-legal）成员可传
        // 这是宪法红线 — MC 客户数据严禁混存到 lty-vault repo
        // 2026-05-12 放宽：Maggie 等 LTY 法务部同事日常协作 MC 法务事务，需要可选 MC 路由
        let targetVault = 'lty-vault';
        if (meta.targetVault === 'mc-legal-vault') {
          const { userCanRouteMcLegal } = await import('@/lib/knowledge-access');
          const ok = await userCanRouteMcLegal(dbUser.id);
          if (!ok) {
            throw new Error('FORBIDDEN: 仅老板 + 法务部成员可上传到 mc-legal-vault');
          }
          targetVault = 'mc-legal-vault';
        }

        return {
          // allowedContentTypes 故意不设 = 任意类型放行
          // （之前误填 '*/*' 触发 Vercel SDK literal 字符串匹配，zip 被拒）
          maximumSizeInBytes: MAX_BYTES,
          tokenPayload: JSON.stringify({
            uploaderId: dbUser.id,
            originalFilename: meta.originalFilename ?? 'unknown',
            description,
            targetVault,
          }),
        };
      },

      // Vercel Blob 上传完通知我们 → 写 DB（webhook 调用）
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        try {
          const meta = tokenPayload ? JSON.parse(tokenPayload) : {};
          await prisma.pendingUpload.create({
            data: {
              blobUrl: blob.url,
              blobPathname: blob.pathname,
              filename: meta.originalFilename ?? 'unknown',
              contentType: blob.contentType ?? null,
              sizeBytes: 0, // blob.size 可能没填；Mac 端 download 时实际 size 会更准
              uploaderId: meta.uploaderId ?? '',
              description: meta.description ?? null,
              targetVault: meta.targetVault === 'mc-legal-vault' ? 'mc-legal-vault' : 'lty-vault',
              status: 'pending',
            },
          });
        } catch (e) {
          console.error('[knowledge/upload] onUploadCompleted record fail:', e);
          // 抛出会让 Vercel 重试 webhook
          throw e;
        }
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'UNKNOWN_ERROR';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
