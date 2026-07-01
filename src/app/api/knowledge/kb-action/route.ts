/**
 * T3 · 知识条目人工操作 API（纯薄壳）。
 *
 * 铁律：本 route 不直接改 status / cite_allowed / commit_hash，只把请求转给
 * drudge 侧 kb_action.py（唯一入口，内部走 kb_state.transition）。
 * actor 一律从 session 解析，绝不信前端。
 *
 * POST body: { action, file, reason?, owner?, permission?, version? }
 */
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { runKbAction, type KbAction } from '@/lib/kb-actions';

export const dynamic = 'force-dynamic';

const ACTIONS = new Set<KbAction>(['confirm', 'reject', 'setfields', 'publish']);
const PERMISSIONS = new Set(['public', 'dept_internal', 'confidential', 'top_secret']);

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, role: true, active: true },
  });
  if (!dbUser?.active) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN: 账号未激活' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string; file?: string; reason?: string;
    owner?: string; permission?: string; version?: string;
  };
  const action = body.action as KbAction;
  const file = body.file;

  if (!action || !ACTIONS.has(action) || !file) {
    return NextResponse.json({ ok: false, error: 'BAD_REQUEST' }, { status: 400 });
  }
  if (action === 'reject' && !(body.reason && body.reason.trim())) {
    return NextResponse.json({ ok: false, error: '驳回必须填原因' }, { status: 400 });
  }
  // 发布入库 = 管家动作，仅 SUPER_ADMIN
  if (action === 'publish' && dbUser.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, error: '仅管家(SUPER_ADMIN)可发布入库' }, { status: 403 });
  }
  if (body.permission && !PERMISSIONS.has(body.permission)) {
    return NextResponse.json({ ok: false, error: 'BAD_PERMISSION' }, { status: 400 });
  }

  const actor = `${dbUser.name ?? dbUser.id}(${dbUser.role})`;
  const result = await runKbAction(action, file, {
    actor,
    reason: body.reason,
    owner: body.owner,
    permission: body.permission,
    version: body.version,
  });

  return NextResponse.json(result, { status: result?.ok ? 200 : 400 });
}
