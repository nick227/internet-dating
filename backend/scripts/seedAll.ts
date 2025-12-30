import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/lib/prisma/client.js';
import { runCompatibilityJob } from '../src/jobs/compatibilityJob.js';
import { runMatchScoreJob } from '../src/jobs/matchScoreJob.js';
import { seedFeedDemo } from './seedFeedDemo.js';
import { seedInterests } from './seedInterests.js';
import { seedProfiles } from './seedProfiles.js';
import { seedQuizzes } from './seedQuizzes.js';

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

function parseFlag(flag: string) {
  return process.argv.includes(flag);
}

function parseStringArg(flag: string, fallback: string) {
  const raw = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (!raw) return fallback;
  const value = raw.split('=')[1];
  return value?.length ? value : fallback;
}

function parseIntArg(flag: string, fallback: number) {
  const raw = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (!raw) return fallback;
  const value = raw.split('=')[1];
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBigIntArg(flag: string) {
  const raw = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (!raw) return null;
  const value = raw.split('=')[1];
  if (!value || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

async function main() {
  const skipDemo = parseFlag('--skipDemo');
  const skipInterests = parseFlag('--skipInterests');
  const skipQuizzes = parseFlag('--skipQuizzes');
  const skipMatchScores = parseFlag('--skipMatchScores');
  const skipCompatibility = parseFlag('--skipCompatibility');

  const demoCount = parseIntArg('--demoCount', 12);
  const viewerEmail = parseStringArg('--viewerEmail', 'nick@gmail.com');
  const viewerUserIdArg = parseBigIntArg('--viewerUserId');

  const { ids: seedIds, byEmail } = await seedProfiles();
  const viewerUserId = viewerUserIdArg ?? byEmail[viewerEmail] ?? seedIds[0] ?? null;

  if (!skipDemo) {
    await seedFeedDemo({ count: demoCount, viewerUserId });
  }

  if (!skipInterests) {
    await seedInterests();
  }

  const allUserIds = (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id);

  if (!skipQuizzes) {
    await seedQuizzes({ userIds: allUserIds });
  }

  if (!skipMatchScores) {
    const batchSize = parseIntArg('--batchSize', 100);
    const candidateBatchSize = parseIntArg('--candidateBatchSize', 500);
    const pauseMs = parseIntArg('--pauseMs', 50);
    const algorithmVersion = process.env.MATCH_ALGO_VERSION ?? 'v1';
    await runMatchScoreJob({
      userBatchSize: batchSize,
      candidateBatchSize,
      pauseMs,
      algorithmVersion
    });
  }

  if (!skipCompatibility) {
    const batchSize = parseIntArg('--compatBatchSize', 100);
    const targetBatchSize = parseIntArg('--compatTargetBatchSize', 500);
    const pauseMs = parseIntArg('--compatPauseMs', 50);
    const maxSuggestionTargets = parseIntArg('--compatMaxSuggestions', 100);
    const algorithmVersion = process.env.COMPATIBILITY_ALGO_VERSION ?? 'v1';
    await runCompatibilityJob({
      userBatchSize: batchSize,
      targetBatchSize,
      pauseMs,
      maxSuggestionTargets,
      algorithmVersion
    });
  }

  console.log('Seed all completed.');
}

const isDirect = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirect) {
  main()
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
