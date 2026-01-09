/**
 * Reset database - removes all seeded data
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prisma } from '../../../src/lib/prisma/client.js';

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  try {
    const raw = readFileSync(new URL('../../../.env', import.meta.url), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, valueRaw] = match;
      if (process.env[key] != null) continue;
      let value = valueRaw.trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {}
}

loadEnv();

async function resetDatabase(onlyTestData = false) {
  if (onlyTestData) {
    console.log('\n⚠️  Deleting ONLY test/seed data (preserving real users)...\n');
    console.log('Test users are identified by emails starting with "test." or "seed." or "demo."\n');
  } else {
    console.log('\n⚠️  WARNING: This will delete ALL data!\n');
  }
  
  console.log('Deleting in 3 seconds... (Ctrl+C to cancel)');
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log('\nDeleting data...\n');
  
  // Delete in reverse order of dependencies
  await prisma.$executeRaw`SET FOREIGN_KEY_CHECKS = 0`;
  
  // Identify test users
  const testUserIds = onlyTestData ? (await prisma.user.findMany({
    where: {
      OR: [
        { email: { startsWith: 'test.' } },
        { email: { startsWith: 'seed.' } },
        { email: { startsWith: 'demo.' } },
        { email: { contains: '@example.com' } }
      ]
    },
    select: { id: true }
  })).map(u => u.id) : undefined;
  
  const whereClause = testUserIds ? { userId: { in: testUserIds } } : {};
  const whereUserClause = testUserIds ? { id: { in: testUserIds } } : {};
  
  // Activity data
  await prisma.message.deleteMany({ where: { senderId: { in: testUserIds || [] } } });
  console.log('✓ Deleted messages');
  
  await prisma.conversation.deleteMany({ 
    where: testUserIds ? { 
      OR: [
        { userAId: { in: testUserIds } },
        { userBId: { in: testUserIds } }
      ]
    } : {}
  });
  console.log('✓ Deleted conversations');
  
  await prisma.match.deleteMany({ 
    where: testUserIds ? { 
      OR: [
        { userAId: { in: testUserIds } },
        { userBId: { in: testUserIds } }
      ]
    } : {}
  });
  console.log('✓ Deleted matches');
  
  await prisma.like.deleteMany({ 
    where: testUserIds ? { 
      OR: [
        { fromUserId: { in: testUserIds } },
        { toUserId: { in: testUserIds } }
      ]
    } : {}
  });
  console.log('✓ Deleted likes');
  
  await prisma.likedPost.deleteMany({ where: whereClause });
  console.log('✓ Deleted liked posts');
  
  await prisma.feedSeen.deleteMany({ where: { viewerUserId: { in: testUserIds || [] } } });
  console.log('✓ Deleted feed seen');
  
  await prisma.post.deleteMany({ where: whereClause });
  console.log('✓ Deleted posts');
  
  // Profile data
  await prisma.quizResult.deleteMany({ where: whereClause });
  console.log('✓ Deleted quiz results');
  
  await prisma.userInterest.deleteMany({ where: whereClause });
  console.log('✓ Deleted user interests');
  
  await prisma.media.deleteMany({ where: whereClause });
  console.log('✓ Deleted media');
  
  await prisma.profile.deleteMany({ where: whereClause });
  console.log('✓ Deleted profiles');
  
  await prisma.user.deleteMany({ where: whereUserClause });
  console.log(`✓ Deleted ${testUserIds?.length || 'all'} users`);
  
  // Derived data (optional - could keep for performance)
  await prisma.matchScore.deleteMany({});
  console.log('✓ Deleted match scores');
  
  await prisma.$executeRaw`SET FOREIGN_KEY_CHECKS = 1`;
  
  console.log('\n✅ Database reset complete!\n');
}

function parseFlag(flag: string) {
  return process.argv.includes(flag);
}

async function main() {
  const onlyTest = parseFlag('--test-only');
  await resetDatabase(onlyTest);
}

const isDirect = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirect) {
  main()
    .catch(err => {
      console.error('Reset failed:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { resetDatabase };
