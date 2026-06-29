/**
 * 通用 audit helper — 2026-06-29
 *
 * 任何 mutations API 一行调用记 audit:
 *   import { recordAudit } from '@/lib/audit';
 *   ...
 *   await recordAudit({
 *     resourceType: 'Submission',
 *     resourceId: id,
 *     action: 'DELETE',
 *     actor,
 *     request: req,
 *     before,
 *   });
 *
 * paradigm:
 *   - **不阻断主流程**:audit 失败只 console.error,业务正常返回
 *   - **谁 + 何时 + 何 IP + UA + 前后快照**全留
 *   - 跟现有专属表(TaskAuditLog/VoucherAuditLog)paradigm 兼容
 *
 * 后续递补这些资源(每个 5 行 helper 调用即可,不用每次再设计表):
 *   - Submission, User, Doc, Folder, Attachment,
 *   - Department, DepartmentMembership, NotificationSetting,
 *   - HrCandidate, HrEmployeeProfile, ...
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
}

/**
 * 路由专属 audit 表(已建好)→ 直接写
 * 没有专属表的 → 写到统一 GenericAuditLog 表(待建,目前 fallback console.warn)
 *
 * 当前实现策略:
 *   - resourceType='Task' → 写 TaskAuditLog(已就绪)
 *   - 其他 → 暂时 console.warn 留痕,等 GenericAuditLog 建好再切
 *
 * 后续 v2:
 *   - 加 GenericAuditLog 通用表(resourceType + resourceId + action + actorId/Email/Role + IP/UA + before/after)
 *   - 老 TaskAuditLog 保留(向后兼容)/ 新业务都进 GenericAuditLog
 */
export async function recordAudit(args: RecordAuditArgs): Promise<void> {
  const { resourceType, resourceId, action, actor, request, before, after } = args;
  const { ipAddress, userAgent } = getRequestMeta(request);

  try {
    if (resourceType === 'Task') {
      await prisma.taskAuditLog.create({
        data: {
          taskId: resourceId,
          action,
          actorId: actor.id,
          actorEmail: actor.email ?? '',
          actorRole: actor.role ?? '',
          actorName: actor.name ?? null,
          ipAddress,
          userAgent,
          beforeSnapshot: before ?? undefined,
          afterSnapshot: after ?? undefined,
        },
      });
      return;
    }

    // 未来 resourceType in ['Submission','User','Doc','Folder',...] → 写 GenericAuditLog
    // 现阶段降级 warn 留痕,不阻断业务
    console.warn(
      `[recordAudit] no dedicated audit table for resourceType=${resourceType} yet; ` +
        `falling back to log. id=${resourceId} action=${action} actor=${actor.email ?? actor.id}`,
    );
  } catch (e) {
    // 永不阻断主流程
    console.error('[recordAudit] failed', e);
  }
}
