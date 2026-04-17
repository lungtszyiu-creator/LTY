import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  if (adminEmails.length === 0) {
    console.log('No ADMIN_EMAILS set — skipping seed.');
    return;
  }

  for (const email of adminEmails) {
    await prisma.user.upsert({
      where: { email },
      update: { role: 'ADMIN', active: true },
      create: { email, role: 'ADMIN', active: true },
    });
    console.log(`Seeded admin: ${email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
