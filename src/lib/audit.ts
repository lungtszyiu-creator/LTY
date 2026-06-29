/**
 * 通用 audit helper — 2026-06-29 v2
 *
 * 任何 mutations API 一行调用记 audit:
 *   import { recordAudit } from '@/lib/audit';
 *   ...
 *   recordAudit({
 *     resourceType: 'Submission',
 *     resourceId: id,
 *     action: 'DELETE',
 *     actor,
 *     request: req,
 *     before,
 *   }); // 不要 await — 已自带 .catch + 不阻塞
 *
 * paradigm:
 *   - **不阻断主流程**:audit 失败只 console.error,业务正常返回
 *   - **谁 + 何时 + 何 IP + UA + 前后快照**全留
 *   - resourceType='Task' → 同时写 TaskAuditLog(v1 兼容)+ GenericAuditLog
 *   - 其他 resourceType → 只写 GenericAuditLog
 *
 * 涵盖资源(v2 接入,全 DELETE handler):
 *   Task / Submission / User / Doc / Folder / Department / Position / Announcement / Attachment / Report
 *   凭证不用接入(VoucherAuditLog 已有专属表)
 */
import type { NextRequest } from 'next/server';
import { prisma } from './db';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | string;

export type AuditActor = {
  id: string;
  email?: string | null;
  role?: string | null;
  name?: string | null;
};

export type AuditRequest = Pick<NextRequest, 'headers'> & { ip?: string | null };

export function getRequestMeta(req: AuditRequest | undefined) {
  if (!req) return { ipAddress: null, userAgent: null };
  const ipAddress =
    req.headers.get?.('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get?.('x-real-ip') ||
    (req as any).ip ||
    null;
  const userAgent = req.headers.get?.('user-agent') || null;
  return { ipAddress, userAgent };
}

interface RecordAuditArgs {
  /** 资源类型 — 'Task'/'Submission'/'User'/'Doc'/... 用 model 名 */
  resourceType: string;
  /** 资源 id */
  resourceId: string;
  /** CREATE / UPDATE / DELETE */
  action: AuditAction;
  /** 操作人 */
  actor: AuditActor;
  /** 原始请求(可选,记 IP + UA) */
  request?: AuditRequest;
  /** 改/删前快照 */
  before?: any;
  /** 改后快照(DELETE 时不传) */
  after?: any;
  /** 额外上下文 (e.g. 删除原因 / 操作上下文) */
  metadata?: any;
}

/**
 * 写一条 audit log;**完全不阻断主流程,失败只 console.error**。
 *
 * 写入策略:
 *   - resourceType='Task' → 兼容 v1, 双写 TaskAuditLog + GenericAuditLog
 *   - 其他 resourceType → 只写 GenericAuditLog
 */
export function recordAudit(args: RecordAuditArgs): Promise<void> {
  const { resourceType, resourceId, action, actor, request, before, after, metadata } = args;
  const { ipAddress, userAgent } = getRequestMeta(request);

  const commonData = {
    actorId: actor.id,
    actorEmail: actor.email ?? '',
    actorRole: actor.role ?? '',
    actorName: actor.name ?? null,
    ipAddress,
    userAgent,
    beforeSnapshot: before ?? undefined,
    afterSnapshot: after ?? undefined,
  };

  const writes: Promise<unknown>[] = [];

  // 1. 通用表 — 所有 resourceType 都写
  writes.push(
    prisma.genericAuditLog.create({
      data: {
        ...commonData,
        resourceType,
        resourceId,
        action,
        metadata: metadata ?? undefined,
      },
    }),
  );

  // 2. v1 兼容 — Task 同时写专属 TaskAuditLog (兼容旧查询/UI)
  if (resourceType === 'Task') {
    writes.push(
      prisma.taskAuditLog.create({
        data: {
          ...commonData,
          taskId: resourceId,
          action,
        },
      }),
    );
  }

  // 全部失败只记 console,不影响主流程
  return Promise.allSettled(writes).then((results) => {
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(
          `[recordAudit] failed write #${i} resourceType=${resourceType} id=${resourceId}:`,
          r.reason,
        );
      }
    });
  });
}
