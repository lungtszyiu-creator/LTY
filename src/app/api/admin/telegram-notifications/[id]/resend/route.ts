import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/permissions';

/**
 * POST /api/admin/telegram-notifications/[id]/resend
 *
 * 2026-06-24 加 (architecture debt 1.2): 看板调 bridge 重发失败的 TG 通知.
 * 看板不存 bot token, 只传 notification id, bridge 自己用 botKey 反查 + 发.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (resp) {
    return resp instanceof Response ? resp : NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id || !/^cm[a-z0-9]{20,}$/.test(id)) {
    return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 });
  }

  const bridgeUrl = process.env.FINANCE_BRIDGE_URL;
  const bridgeKey = process.env.FINANCE_BRIDGE_KEY || process.env.BRIDGE_KEY;
  if (!bridgeUrl) {
    return NextResponse.json({ ok: false, error: 'FINANCE_BRIDGE_URL not configured' }, { status: 500 });
  }
  if (!bridgeKey) {
    return NextResponse.json({ ok: false, error: 'FINANCE_BRIDGE_KEY not configured' }, { status: 500 });
  }

  try {
    const r = await fetch(
      `${bridgeUrl.replace(/\/$/, '')}/api/telegram-notifications/${encodeURIComponent(id)}/resend`,
      {
        method: 'POST',
        headers: { 'X-Bridge-Key': bridgeKey, 'Content-Type': 'application/json' },
        // 30s timeout via AbortSignal
        signal: AbortSignal.timeout(30_000),
      },
    );
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: j.error || `bridge HTTP ${r.status}` },
        { status: r.status },
      );
    }
    return NextResponse.json(j);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
