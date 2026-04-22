import { NextRequest, NextResponse } from 'next/server';
import { Liveblocks } from '@liveblocks/node';
import { requireUser } from '@/lib/permissions';
import { resolveDocAccess } from '@/lib/docAccess';

// Deterministic color per user so the cursor color stays stable across
// sessions. Maps user-id hash → one of 10 Tailwind-ish presets.
const CURSOR_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#f43f5e',
];
function colorFor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  return CURSOR_COLORS[Math.abs(h) % CURSOR_COLORS.length];
}

// Signs a session token so the Liveblocks client can connect to the room
// matching the current doc. Permission is gated: no view access → no token;
// read-only (canEdit=false) gets a read token so cursors & presence still
// work but they can't mutate the Yjs doc.
export async function POST(req: NextRequest) {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) {
    return NextResponse.json(
      { error: 'LIVEBLOCKS_NOT_CONFIGURED', message: '未配置 LIVEBLOCKS_SECRET_KEY，实时协作暂不可用' },
      { status: 501 }
    );
  }

  const user = await requireUser();
  const { room } = await req.json().catch(() => ({} as any));
  if (!room || typeof room !== 'string' || !room.startsWith('doc:')) {
    return NextResponse.json({ error: 'BAD_ROOM' }, { status: 400 });
  }
  const docId = room.slice('doc:'.length);

  const access = await resolveDocAccess(docId, { id: user.id, role: user.role });
  if (!access.canView) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const liveblocks = new Liveblocks({ secret });
  const session = liveblocks.prepareSession(user.id, {
    userInfo: {
      name: user.name ?? user.email ?? '成员',
      email: user.email ?? '',
      color: colorFor(user.id),
    },
  });

  // Liveblocks permission model:
  //   FULL_ACCESS lets the client edit the Yjs doc.
  //   READ_ACCESS is view-only (cursors still visible, no mutations).
  session.allow(room, access.canEdit ? session.FULL_ACCESS : session.READ_ACCESS);

  const { body, status } = await session.authorize();
  return new NextResponse(body, { status });
}
