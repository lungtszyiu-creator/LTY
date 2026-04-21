import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/permissions';
import { applyDecision } from '@/lib/approvalRuntime';

const schema = z.object({
  stepId: z.string().min(1),
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().max(2000).optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const data = schema.parse(await req.json());
  try {
    const result = await applyDecision(params.id, data.stepId, data.decision, user.id, data.note ?? null);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'FAILED' }, { status: 400 });
  }
}
