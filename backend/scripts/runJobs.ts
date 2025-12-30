import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/lib/prisma/client.js';
import { runCompatibilityJob } from '../src/jobs/compatibilityJob.js';
import { runContentFeatureJob } from '../src/jobs/contentFeatureJob.js';
import { runMatchScoreJob } from '../src/jobs/matchScoreJob.js';
import { runTrendingJob } from '../src/jobs/trendingJob.js';
import { runUserAffinityJob } from '../src/jobs/userAffinityJob.js';
import { runFeedPresortJob } from '../src/jobs/feedPresortJob.js';
import { runFeedPresortCleanupJob } from '../src/jobs/feedPresortCleanup.js';

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

function parseIntArg(flag: string, fallback: number) {
  const raw = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (!raw) return fallback;
  const value = raw.split('=')[1];
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBigIntArg(flag: string): bigint | null {
  const raw = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (!raw) return null;
  const value = raw.split('=')[1];
  if (!value || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

function usage() {
  console.log('Usage: tsx scripts/runJobs.ts <job> [options]');
  console.log('Jobs: match-scores | compatibility | content-features | trending | affinity | feed-presort | feed-presort-cleanup | all');
  console.log('Examples:');
  console.log('  tsx scripts/runJobs.ts match-scores --userId=8 --batchSize=100 --candidateBatchSize=500');
  console.log('  tsx scripts/runJobs.ts compatibility --userId=8 --targetBatchSize=500');
  console.log('  tsx scripts/runJobs.ts content-features --batchSize=50');
  console.log('  tsx scripts/runJobs.ts trending --windowHours=48 --minEngagements=5');
  console.log('  tsx scripts/runJobs.ts affinity --userId=8 --lookbackDays=90');
  console.log('  tsx scripts/runJobs.ts feed-presort --userId=8 --batchSize=100 --segmentSize=20');
}

async function runMatchScores() {
  const userId = parseBigIntArg('--userId');
  const userBatchSize = parseIntArg('--batchSize', 100);
  const candidateBatchSize = parseIntArg('--candidateBatchSize', 500);
  const pauseMs = parseIntArg('--pauseMs', 50);
  const algorithmVersion = process.env.MATCH_ALGO_VERSION ?? 'v1';

  await runMatchScoreJob({
    userId,
    userBatchSize,
    candidateBatchSize,
    pauseMs,
    algorithmVersion
  });
}

async function runCompatibility() {
  const userId = parseBigIntArg('--userId');
  const userBatchSize = parseIntArg('--batchSize', 100);
  const targetBatchSize = parseIntArg('--targetBatchSize', 500);
  const maxSuggestionTargets = parseIntArg('--maxSuggestionTargets', 100);
  const pauseMs = parseIntArg('--pauseMs', 50);
  const algorithmVersion = process.env.COMPATIBILITY_ALGO_VERSION ?? 'v1';

  await runCompatibilityJob({
    userId,
    userBatchSize,
    targetBatchSize,
    maxSuggestionTargets,
    pauseMs,
    algorithmVersion
  });
}

async function runContentFeatures() {
  const postId = parseBigIntArg('--postId');
  const batchSize = parseIntArg('--batchSize', 50);
  const pauseMs = parseIntArg('--pauseMs', 50);
  const maxLookbackDays = parseIntArg('--maxLookbackDays', 7);
  const maxTopics = parseIntArg('--maxTopics', 8);
  const algorithmVersion = process.env.CONTENT_FEATURE_ALGO_VERSION ?? 'v1';

  await runContentFeatureJob({
    postId,
    batchSize,
    pauseMs,
    maxLookbackDays,
    maxTopics,
    algorithmVersion
  });
}

async function runTrending() {
  const windowHours = parseIntArg('--windowHours', 48);
  const expiryHours = parseIntArg('--expiryHours', 48);
  const minEngagements = parseIntArg('--minEngagements', 5);
  const algorithmVersion = process.env.TRENDING_ALGO_VERSION ?? 'v1';

  await runTrendingJob({
    windowHours,
    expiryHours,
    minEngagements,
    algorithmVersion
  });
}

async function runAffinity() {
  const userId = parseBigIntArg('--userId');
  const userBatchSize = parseIntArg('--batchSize', 100);
  const lookbackDays = parseIntArg('--lookbackDays', 90);
  const topCreatorsCount = parseIntArg('--topCreatorsCount', 20);
  const topTopicsCount = parseIntArg('--topTopicsCount', 30);
  const pauseMs = parseIntArg('--pauseMs', 50);
  const algorithmVersion = process.env.AFFINITY_ALGO_VERSION ?? 'v1';

  await runUserAffinityJob({
    userId,
    userBatchSize,
    lookbackDays,
    topCreatorsCount,
    topTopicsCount,
    pauseMs,
    algorithmVersion
  });
}

async function runFeedPresort() {
  const userId = parseBigIntArg('--userId');
  const batchSize = parseIntArg('--batchSize', 100);
  const segmentSize = parseIntArg('--segmentSize', 20);
  const maxSegments = parseIntArg('--maxSegments', 3);
  const incremental = process.argv.includes('--incremental');

  await runFeedPresortJob({
    userId,
    batchSize,
    segmentSize,
    maxSegments,
    incremental,
  });
}

async function runFeedPresortCleanup() {
  await runFeedPresortCleanupJob();
}

async function main() {
  const command = process.argv[2];
  if (!command) {
    usage();
    process.exitCode = 1;
    return;
  }

  switch (command) {
    case 'match-scores':
      await runMatchScores();
      break;
    case 'compatibility':
      await runCompatibility();
      break;
    case 'content-features':
      await runContentFeatures();
      break;
    case 'trending':
      await runTrending();
      break;
    case 'affinity':
      await runAffinity();
      break;
    case 'feed-presort':
      await runFeedPresort();
      break;
    case 'feed-presort-cleanup':
      await runFeedPresortCleanup();
      break;
    case 'all':
      await runMatchScores();
      await runCompatibility();
      await runContentFeatures();
      await runTrending();
      await runAffinity();
      await runFeedPresort();
      break;
    default:
      usage();
      process.exitCode = 1;
      return;
  }

  console.log(`Job "${command}" completed.`);
}

const isDirect = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirect) {
  main()
    .catch((err) => {
      console.error('Job failed:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
