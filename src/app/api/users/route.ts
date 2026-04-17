import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';

export async function GET() {
  await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      active: true,
      createdAt: true,
    },
  });
  return NextResponse.json(users);
}

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
});

// Pre-register a user by email so they can sign in with Google.
// (They'll still need to complete Google OAuth; this just sets role/active in advance.)
export async function POST(req: NextRequest) {
  await requireAdmin();
  const data = createSchema.parse(await req.json());
  const user = await prisma.user.upsert({
    where: { email: data.email },
    update: { role: data.role, active: true, name: data.name ?? undefined },
    create: {
      email: data.email,
      name: data.name,
      role: data.role,
      active: true,
    },
  });
  return NextResponse.json(user, { status: 201 });
}
