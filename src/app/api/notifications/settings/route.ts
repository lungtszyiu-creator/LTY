import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';
import { NOTIFICATION_KINDS } from '@/lib/notificationSettings';

export async function GET() {
  await requireAdmin();
  const rows = await prisma.notificationSetting.findMany();
  const byKind = new Map(rows.map((r) => [r.kind, r]));
  // Ensure every known kind appears (materialise defaults on read).
  const result = NOTIFICATION_KINDS.map((m) => {
    const row = byKind.get(m.kind);
    const extraUserIds: string[] = (() => {
      try { const v = JSON.parse(row?.extraUserIds ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
    })();
    return {
      kind: m.kind,
      label: m.label,
      defaultAudience: m.defaultAudience,
      enabled: row?.enabled ?? true,
      extraUserIds,
      note: row?.note ?? null,
    };
  });
  return NextResponse.json(result);
}

const upsertSchema = z.object({
  kind: z.string().min(1),
  enabled: z.boolean().optional(),
  extraUserIds: z.array(z.string()).optional(),
  note: z.string().max(500).nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  await requireAdmin();
  const data = upsertSchema.parse(await req.json());
  const extraJson = data.extraUserIds !== undefined ? JSON.stringify(data.extraUserIds) : undefined;
  const row = await prisma.notificationSetting.upsert({
    where: { kind: data.kind },
    create: {
      kind: data.kind,
      enabled: data.enabled ?? true,
      extraUserIds: extraJson ?? '[]',
      note: data.note ?? null,
    },
    update: {
      enabled: data.enabled,
      ...(extraJson !== undefined ? { extraUserIds: extraJson } : {}),
      ...(data.note !== undefined ? { note: data.note } : {}),
    },
  });
  return NextResponse.json(row);
}
