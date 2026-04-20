import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/permissions';
import { resendTaskPublished } from '@/lib/email';

const schema = z.object({ taskId: z.string().min(1) });

export async function POST(req: NextRequest) {
  await requireAdmin();
  const { taskId } = schema.parse(await req.json());
  try {
    const result = await resendTaskPublished(taskId);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error ?? 'SEND_FAILED', reason: result.reason },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, attempts: result.attempts });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'UNKNOWN' }, { status: 500 });
  }
}
