import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prisma } from '../../src/lib/prisma/client.js';

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  try {
    const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
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

async function main() {
  const usersWithTraits = await prisma.userTrait.groupBy({
    by: ['userId'],
    _count: { traitKey: true }
  });

  console.log(`\n📊 User Traits Summary:`);
  console.log(`   Users with traits: ${usersWithTraits.length}\n`);

  if (usersWithTraits.length === 0) {
    console.log('   No user traits found. Make sure users have completed quizzes and run build-user-traits job.\n');
    return;
  }

  // Show sample of traits for first user
  const firstUserId = usersWithTraits[0]!.userId;
  const userTraits = await prisma.userTrait.findMany({
    where: { userId: firstUserId },
    orderBy: { traitKey: 'asc' }
  });

  console.log(`   Example user (ID: ${firstUserId}):`);
  console.log(`   Total traits: ${userTraits.length}\n`);

  // Group by trait namespace
  const byNamespace = new Map<string, Array<{ key: string; value: number }>>();
  for (const trait of userTraits) {
    const namespace = trait.traitKey.split('.')[0] ?? 'unknown';
    if (!byNamespace.has(namespace)) {
      byNamespace.set(namespace, []);
    }
    byNamespace.get(namespace)!.push({
      key: trait.traitKey,
      value: Number(trait.value)
    });
  }

  for (const [namespace, traits] of Array.from(byNamespace.entries()).sort()) {
    console.log(`   ${namespace}:`);
    for (const trait of traits.sort((a, b) => a.key.localeCompare(b.key))) {
      const valueStr = trait.value >= 0 ? `+${trait.value.toFixed(1)}` : trait.value.toFixed(1);
      console.log(`      ${trait.key.padEnd(30)} ${valueStr}`);
    }
    console.log();
  }

  // Show trait distribution
  const allTraits = await prisma.userTrait.groupBy({
    by: ['traitKey'],
    _count: { userId: true },
    _avg: { value: true }
  });

  console.log(`   Trait distribution across all users:`);
  for (const trait of allTraits.slice(0, 10).sort((a, b) => b._count.userId - a._count.userId)) {
    const avg = trait._avg.value ?? 0;
    const avgNum = typeof avg === 'number' ? avg : Number(avg);
    const avgStr = avgNum >= 0 ? `+${avgNum.toFixed(2)}` : avgNum.toFixed(2);
    console.log(`      ${trait.traitKey.padEnd(30)} users: ${trait._count.userId.toString().padStart(3)}, avg: ${avgStr}`);
  }
  if (allTraits.length > 10) {
    console.log(`      ... and ${allTraits.length - 10} more traits`);
  }
  console.log();
}

main()
  .catch((err) => {
    console.error('Verification failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
