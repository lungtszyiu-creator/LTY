/**
 * 吊销 API Key
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const admin = await requireAdmin();

  const updated = await prisma.apiKey.update({
    where: { id: params.id },
    data: {
      active: false,
      revokedAt: new Date(),
      revokedById: admin.id,
    },
    select: { id: true, name: true, revokedAt: true, active: true },
  });

  return NextResponse.json(updated);
}
