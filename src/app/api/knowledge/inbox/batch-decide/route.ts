/**
 * 看板批量审批 inbox 决策 · 写 InboxApprovalDecision 表
 *
 * POST {
 *   items: [{ path, summary?, confidence?, guessedDept?, guessedType? }, ...],
 *   decision: "APPROVED" | "REJECTED" | "DELETED",
 *   approvedDept?: string,    // 仅 APPROVED 必填
 *   approvedType?: string     // 仅 APPROVED 必填
 * }
 *
 * 鉴权：NextAuth session + SUPER_ADMIN 单一审批人(老板)
 *
 * 写入后:
 *   ~30s 内 launchd com.lty.drudge.inbox-consumer 拉起 inbox_consumer.py
 *   → mv 文件 / git commit / push → 更新 status=DONE
 *
 * 幂等: itemPath 是 unique key,重复点同一条会 ON CONFLICT 失败(返回 409 列表)
 */
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Decision = 'APPROVED' | 'REJECTED' | 'DELETED';

interface IncomingItem {
  path: string;
  summary?: string | null;
  confidence?: number | null;
  guessedDept?: string | null;
  guessedType?: string | null;
}

interface Body {
  items?: IncomingItem[];
  decision?: Decision;
  approvedDept?: string | null;
  approvedType?: string | null;
}

const VALID_DECISIONS: Decision[] = ['APPROVED', 'REJECTED', 'DELETED'];

// 防御:只允许 raw/_inbox/_pending/ 前缀,避免 path traversal
function isSafePath(p: string): boolean {
  if (!p || typeof p !== 'string') return false;
  if (p.includes('..')) return false;
  if (!p.startsWith('raw/_inbox/_pending/')) return false;
  return true;
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, active: true },
  });
  if (!dbUser?.active || dbUser.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const { items, decision, approvedDept, approvedType } = body;

  if (!decision || !VALID_DECISIONS.includes(decision)) {
    return NextResponse.json(
      { error: 'INVALID_DECISION', detail: 'decision 必须是 APPROVED/REJECTED/DELETED' },
      { status: 400 },
    );
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'EMPTY_ITEMS' }, { status: 400 });
  }
  if (items.length > 200) {
    return NextResponse.json(
      { error: 'TOO_MANY', detail: '单次最多 200 条,分批提交' },
      { status: 400 },
    );
  }
  if (decision === 'APPROVED') {
    if (!approvedDept || !approvedType) {
      return NextResponse.json(
        { error: 'MISSING_DEPT_TYPE', detail: 'APPROVED 必须指定 approvedDept + approvedType' },
        { status: 400 },
      );
    }
  }

  // 防御 path
  const badPaths = items.filter((i) => !isSafePath(i.path)).map((i) => i.path);
  if (badPaths.length > 0) {
    return NextResponse.json(
      { error: 'UNSAFE_PATH', detail: '路径必须以 raw/_inbox/_pending/ 开头', paths: badPaths.slice(0, 5) },
      { status: 400 },
    );
  }

  // 批量插入 — createMany + skipDuplicates(防同一条重复点)
  const records = items.map((i) => ({
    itemPath: i.path,
    decision,
    approvedDept: decision === 'APPROVED' ? approvedDept ?? null : null,
    approvedType: decision === 'APPROVED' ? approvedType ?? null : null,
    status: 'PENDING',
    decidedById: dbUser.id,
    originalGuessedDept: i.guessedDept ?? null,
    originalGuessedType: i.guessedType ?? null,
    originalSummary: i.summary ?? null,
    originalConfidence: i.confidence ?? null,
  }));

  const result = await prisma.inboxApprovalDecision.createMany({
    data: records,
    skipDuplicates: true, // itemPath unique,重复点同一条直接跳过
  });

  return NextResponse.json({
    queued: result.count,
    requested: items.length,
    skipped: items.length - result.count, // 已经在队列里的(重复点)
    decision,
    approvedDept: decision === 'APPROVED' ? approvedDept : null,
    approvedType: decision === 'APPROVED' ? approvedType : null,
    hint:
      result.count > 0
        ? '已入队 → drudge 每 30s 消化一次,看 /knowledge 状态'
        : '所有项已在队列(或已消化),无新入队',
  });
}
