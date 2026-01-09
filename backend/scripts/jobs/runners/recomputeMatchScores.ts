import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prisma } from '../../../src/lib/prisma/client.js';
import { runMatchScoreJob } from '../../../src/jobs/matchScoreJob.js';

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  try {
    const raw = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
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

function parseUserIdArg() {
  const raw = process.argv.find((arg) => arg.startsWith('--userId='));
  if (!raw) return null;
  const value = raw.split('=')[1];
  if (!value || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

function parseIntArg(flag: string, fallback: number) {
  const raw = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (!raw) return fallback;
  const value = raw.split('=')[1];
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function main() {
  const userIdArg = parseUserIdArg();
  const batchSize = parseIntArg('--batchSize', 100);
  const candidateBatchSize = parseIntArg('--candidateBatchSize', 500);
  const pauseMs = parseIntArg('--pauseMs', 50);
  const algorithmVersion = process.env.MATCH_ALGO_VERSION ?? 'v1';

  await runMatchScoreJob({
    userId: userIdArg,
    userBatchSize: batchSize,
    candidateBatchSize,
    pauseMs,
    algorithmVersion
  });

  console.log(`Match score job completed${userIdArg ? ` for user ${userIdArg}` : ''}.`);
}

const isDirect = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirect) {
  main()
    .catch((err) => {
      console.error('Recompute failed:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
