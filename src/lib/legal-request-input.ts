/**
 * 法务工单 POST body 解析 / alias 兼容 (Maggie V5 spec ↔ 看板 schema)
 *
 * Maggie V5 给的 Bot spec 跟我现有 LtyLegalRequest / McLegalRequest 字段对不上：
 *   - type ↔ category（值也要映射 contract_review → CONTRACT_REVIEW 等）
 *   - submitter (Telegram @username / 中文名 / email) ↔ requesterId (User.id)
 *   - assignee 同上
 *   - priority high/medium/low ↔ HIGH/NORMAL/LOW
 *   - department (LTY_LEGAL/MC_LEGAL) 校验跟 URL 一致
 *   - source 固定 ai_bot ↔ createdByAi（AI key 路径自动写 scope role，本字段可忽略或覆盖）
 *   - ai_triage_reasoning 没对应字段 → 拼到 notes 前缀
 *
 * 跟 PR #90 HR 兼容同套路：本端点接受新 alias 字段，也兼容老字段。
 */
import { z } from 'zod';
import { prisma } from './db';

/** 内部归一后的工单创建参数（跟 LtyLegalRequest / McLegalRequest data 字段对齐） */
export type ResolvedLegalRequestInput = {
  title: string;
  description: string | null;
  category: 'CONTRACT_REVIEW' | 'IP' | 'COMPLIANCE' | 'DISPUTE' | 'OTHER' | null;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  requesterId: string;
  assigneeId: string | null;
  notes: string | null;
  vaultPath: string | null;
};

/** zod schema 同时接受老字段 + Maggie V5 alias（type/submitter/assignee 字符串等） */
export const legalRequestCreateInputSchema = z.object({
  // 老字段（看板原 schema）
  title: z.string().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  category: z.string().nullable().optional(),
  priority: z.string().nullable().optional(),
  requesterId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  vaultPath: z.string().max(500).nullable().optional(),

  // Maggie V5 alias
  type: z.string().nullable().optional(),
  submitter: z.string().nullable().optional(),
  assignee: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  ai_triage_reasoning: z.string().max(2000).nullable().optional(),
});

export type LegalRequestCreateInput = z.infer<typeof legalRequestCreateInputSchema>;

/** type alias 值 → category 枚举（小写/中划线 → 大写下划线） */
const TYPE_TO_CATEGORY: Record<string, ResolvedLegalRequestInput['category']> = {
  // Maggie spec
  contract_review: 'CONTRACT_REVIEW',
  license_query: 'COMPLIANCE',
  compliance_consult: 'COMPLIANCE',
  compliance: 'COMPLIANCE',
  weekly_report: 'OTHER',
  other: 'OTHER',
  ip: 'IP',
  dispute: 'DISPUTE',
  // 老字段（直接传枚举大写）
  CONTRACT_REVIEW: 'CONTRACT_REVIEW',
  IP: 'IP',
  COMPLIANCE: 'COMPLIANCE',
  DISPUTE: 'DISPUTE',
  OTHER: 'OTHER',
};

/** priority alias 值 → 枚举（high/medium/low ↔ HIGH/NORMAL/LOW） */
const PRIORITY_MAP: Record<string, ResolvedLegalRequestInput['priority']> = {
  high: 'HIGH',
  HIGH: 'HIGH',
  medium: 'NORMAL',
  med: 'NORMAL',
  normal: 'NORMAL',
  NORMAL: 'NORMAL',
  low: 'LOW',
  LOW: 'LOW',
  urgent: 'URGENT',
  URGENT: 'URGENT',
};

/** department alias → dept slug */
const DEPT_TO_SLUG: Record<string, 'lty-legal' | 'mc-legal'> = {
  LTY_LEGAL: 'lty-legal',
  lty_legal: 'lty-legal',
  'lty-legal': 'lty-legal',
  法务部: 'lty-legal',
  MC_LEGAL: 'mc-legal',
  mc_legal: 'mc-legal',
  'mc-legal': 'mc-legal',
  MC法务: 'mc-legal',
  MC法务部: 'mc-legal',
};

/**
 * 把 `submitter` / `assignee` 自由字符串解析到 User.id。
 *
 * 接受顺序：
 *   1. 以 cuid 长度的 id（25 字符）开头 → 试当作 User.id（兼容老字段 requesterId）
 *   2. 包含 `@` 且看起来像 email → 按 email 精确查
 *   3. 以 `@` 开头（Telegram handle，看板没存）→ 去掉 @ 用剩余字符串按 name 精确查
 *   4. 否则按 name 精确查
 *   5. 命中唯一就返 id；多个候选返 'AMBIGUOUS'；找不到返 'NOT_FOUND'
 */
type ResolveResult =
  | { ok: true; userId: string; resolvedBy: 'id' | 'email' | 'handle' | 'name' }
  | { ok: false; reason: 'NOT_FOUND' | 'AMBIGUOUS'; candidates?: { id: string; name: string | null; email: string }[] };

export async function resolveUserRef(raw: string): Promise<ResolveResult> {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: 'NOT_FOUND' };

  // 1. cuid-looking id（25 chars 全小写字母数字）
  if (/^c[a-z0-9]{24,}$/i.test(trimmed)) {
    const u = await prisma.user.findUnique({
      where: { id: trimmed },
      select: { id: true, name: true, email: true },
    });
    if (u) return { ok: true, userId: u.id, resolvedBy: 'id' };
    // 不是真 id，落到 name fallback
  }

  // 2. email
  if (trimmed.includes('@') && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
    const u = await prisma.user.findUnique({
      where: { email: trimmed },
      select: { id: true },
    });
    if (u) return { ok: true, userId: u.id, resolvedBy: 'email' };
    return { ok: false, reason: 'NOT_FOUND' };
  }

  // 3 + 4. Telegram handle (@xxx) 或 name
  const nameQuery = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  const matches = await prisma.user.findMany({
    where: { name: nameQuery },
    select: { id: true, name: true, email: true },
    take: 5,
  });
  if (matches.length === 0) return { ok: false, reason: 'NOT_FOUND' };
  if (matches.length > 1) {
    return { ok: false, reason: 'AMBIGUOUS', candidates: matches };
  }
  return {
    ok: true,
    userId: matches[0].id,
    resolvedBy: trimmed.startsWith('@') ? 'handle' : 'name',
  };
}

export type ResolveError = {
  field: 'submitter' | 'assignee' | 'department' | 'priority' | 'type';
  code: string;
  hint: string;
  candidates?: { id: string; name: string | null; email: string }[];
};

/**
 * 把混合 body（老字段 + Maggie V5 alias）解析为标准 ResolvedLegalRequestInput。
 *
 * 返回 { ok: true, data } 或 { ok: false, error }。
 * session 路径 fallback requesterId 用 session.userId（caller 传入）；apikey 路径
 * 必须从 body 解析。
 */
export async function resolveLegalRequestInput(opts: {
  body: LegalRequestCreateInput;
  expectedDeptSlug: 'lty-legal' | 'mc-legal';
  /** session 模式 fallback requesterId（apikey 模式传 null） */
  sessionUserId: string | null;
}): Promise<
  | { ok: true; data: ResolvedLegalRequestInput; resolvedBy: { submitter: string; assignee?: string } }
  | { ok: false; error: ResolveError }
> {
  const b = opts.body;

  // 1. department 校验（如果传了）
  if (b.department) {
    const requestedSlug = DEPT_TO_SLUG[b.department];
    if (!requestedSlug) {
      return {
        ok: false,
        error: {
          field: 'department',
          code: 'UNKNOWN_DEPARTMENT',
          hint: `department=${b.department} 未识别。接受 LTY_LEGAL/MC_LEGAL/lty-legal/mc-legal/法务部/MC法务`,
        },
      };
    }
    if (requestedSlug !== opts.expectedDeptSlug) {
      return {
        ok: false,
        error: {
          field: 'department',
          code: 'DEPT_MISMATCH',
          hint: `URL 走 ${opts.expectedDeptSlug}，但 body department=${b.department}（=${requestedSlug}）。本端点只处理 ${opts.expectedDeptSlug} 工单。`,
        },
      };
    }
  }

  // 2. type / category 归一
  let category: ResolvedLegalRequestInput['category'] = null;
  const rawType = b.type || b.category;
  if (rawType) {
    const lookup = TYPE_TO_CATEGORY[rawType] ?? TYPE_TO_CATEGORY[rawType.toUpperCase()];
    if (!lookup) {
      return {
        ok: false,
        error: {
          field: 'type',
          code: 'UNKNOWN_TYPE',
          hint: `type/category=${rawType} 未识别。接受 contract_review/license_query/compliance_consult/weekly_report/other 或大写 CONTRACT_REVIEW/IP/COMPLIANCE/DISPUTE/OTHER`,
        },
      };
    }
    category = lookup;
  }

  // 3. priority 归一
  let priority: ResolvedLegalRequestInput['priority'] = 'NORMAL';
  if (b.priority) {
    const lookup = PRIORITY_MAP[b.priority];
    if (!lookup) {
      return {
        ok: false,
        error: {
          field: 'priority',
          code: 'UNKNOWN_PRIORITY',
          hint: `priority=${b.priority} 未识别。接受 high/medium/low/urgent（或大写）`,
        },
      };
    }
    priority = lookup;
  }

  // 4. requester 解析（submitter alias 优先）
  let requesterId: string | null = null;
  let resolvedSubmitter = 'unknown';
  const submitterRaw = b.submitter || b.requesterId;
  if (submitterRaw) {
    const res = await resolveUserRef(submitterRaw);
    if (!res.ok) {
      return {
        ok: false,
        error: {
          field: 'submitter',
          code: res.reason === 'NOT_FOUND' ? 'SUBMITTER_NOT_FOUND' : 'SUBMITTER_AMBIGUOUS',
          hint:
            res.reason === 'NOT_FOUND'
              ? `submitter="${submitterRaw}" 找不到 User。请改传 email 或先去 /admin/users 创建账号。`
              : `submitter="${submitterRaw}" 匹配到多个 User，请改用 email 或 cuid 精确指定。`,
          candidates: res.candidates,
        },
      };
    }
    requesterId = res.userId;
    resolvedSubmitter = `${res.resolvedBy}:${submitterRaw}`;
  } else if (opts.sessionUserId) {
    requesterId = opts.sessionUserId;
    resolvedSubmitter = `session:${opts.sessionUserId}`;
  }
  if (!requesterId) {
    return {
      ok: false,
      error: {
        field: 'submitter',
        code: 'SUBMITTER_REQUIRED',
        hint: '必须传 submitter（Telegram @username / email / 姓名 / userId）',
      },
    };
  }

  // 5. assignee 解析（可选）
  let assigneeId: string | null = null;
  let resolvedAssignee: string | undefined;
  const assigneeRaw = b.assignee || b.assigneeId;
  if (assigneeRaw && assigneeRaw.trim()) {
    const res = await resolveUserRef(assigneeRaw);
    if (!res.ok) {
      return {
        ok: false,
        error: {
          field: 'assignee',
          code: res.reason === 'NOT_FOUND' ? 'ASSIGNEE_NOT_FOUND' : 'ASSIGNEE_AMBIGUOUS',
          hint:
            res.reason === 'NOT_FOUND'
              ? `assignee="${assigneeRaw}" 找不到 User。如不指派可留空。`
              : `assignee="${assigneeRaw}" 匹配多个 User，请精确传 email 或 cuid。`,
          candidates: res.candidates,
        },
      };
    }
    assigneeId = res.userId;
    resolvedAssignee = `${res.resolvedBy}:${assigneeRaw}`;
  }

  // 6. notes 拼接：ai_triage_reasoning 前缀 + 原 notes
  let notes: string | null = b.notes?.trim() || null;
  if (b.ai_triage_reasoning?.trim()) {
    const prefix = `## AI 分诊理由\n\n${b.ai_triage_reasoning.trim()}`;
    notes = notes ? `${prefix}\n\n---\n\n${notes}` : prefix;
  }

  return {
    ok: true,
    data: {
      title: b.title.trim(),
      description: b.description?.trim() || null,
      category,
      priority,
      requesterId,
      assigneeId,
      notes,
      vaultPath: b.vaultPath?.trim() || null,
    },
    resolvedBy: { submitter: resolvedSubmitter, assignee: resolvedAssignee },
  };
}
