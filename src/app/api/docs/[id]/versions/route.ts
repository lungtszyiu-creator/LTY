import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';
import { resolveDocAccess } from '@/lib/docAccess';

// GET version list for a doc (metadata only). Tap a row then a sibling
// endpoint would return the full body; we inline title so the UI can
// render without an extra fetch for the picker.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const access = await resolveDocAccess(params.id, { id: user.id, role: user.role });
  if (!access.canView) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const versions = await prisma.docVersion.findMany({
    where: { docId: params.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: { createdBy: { select: { id: true, name: true, email: true } } },
  });
  return NextResponse.json(versions);
}
