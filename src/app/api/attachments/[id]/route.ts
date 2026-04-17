import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/permissions';

// Attachments live in Vercel Blob (public bucket with unguessable URLs).
// We gate access here: only authenticated users get the redirect.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await requireUser();
  const att = await prisma.attachment.findUnique({ where: { id: params.id } });
  if (!att) return new Response('not found', { status: 404 });
  return NextResponse.redirect(att.storedPath, 302);
}
