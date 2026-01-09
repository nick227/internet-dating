import { prisma } from '../../src/lib/prisma/client.js';
import bcrypt from 'bcryptjs';

async function createAdmin(email: string, password: string, role: 'ADMIN' | 'SUPER_ADMIN' = 'ADMIN') {
  const passwordHash = await bcrypt.hash(password, 10);
  
  const user = await prisma.user.upsert({
    where: { email },
    update: { role },
    create: {
      email,
      passwordHash,
      role,
      profile: {
        create: {
          displayName: role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin',
          isVisible: false
        }
      }
    }
  });

  console.log(`✓ ${role} user created: ${email} (ID: ${user.id})`);
  return user;
}

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  const role = process.argv[4] as 'ADMIN' | 'SUPER_ADMIN' | undefined;

  if (!email || !password) {
    console.error('Usage: pnpm tsx scripts/admin/createAdmin.ts <email> <password> [ADMIN|SUPER_ADMIN]');
    process.exit(1);
  }

  await createAdmin(email, password, role || 'ADMIN');
  await prisma.$disconnect();
}

main().catch(console.error);
