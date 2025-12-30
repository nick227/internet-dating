import { readFileSync } from 'node:fs';
import { prisma } from '../src/lib/prisma/client.js';
import { recomputeMatchScoresForUser } from '../src/jobs/matchScoreJob.js';

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

function parseUserIdArg() {
  const raw = process.argv.find((arg) => arg.startsWith('--userId='));
  if (!raw) return 8n;
  const value = raw.split('=')[1];
  if (!value || !/^\d+$/.test(value)) return 8n;
  return BigInt(value);
}

loadEnv();

async function main() {
  const userId = parseUserIdArg();
  await recomputeMatchScoresForUser(userId);

  const results = await prisma.matchScore.findMany({
    where: { userId },
    orderBy: { score: 'desc' },
    take: 5,
    select: {
      candidateUserId: true,
      score: true,
      reasons: true,
      scoreQuiz: true,
      scoreInterests: true,
      scoreRatingsQuality: true,
      scoreRatingsFit: true,
      scoreNew: true,
      scoreNearby: true,
      ratingAttractive: true,
      ratingSmart: true,
      ratingFunny: true,
      ratingInteresting: true,
      distanceKm: true,
      candidate: { select: { profile: { select: { displayName: true } } } }
    }
  });

  const output = results.map((row) => ({
    candidateUserId: row.candidateUserId.toString(),
    name: row.candidate.profile?.displayName ?? null,
    score: row.score,
    subscores: {
      quiz: row.scoreQuiz,
      interests: row.scoreInterests,
      ratingQuality: row.scoreRatingsQuality,
      ratingFit: row.scoreRatingsFit,
      newness: row.scoreNew,
      nearby: row.scoreNearby
    },
    ratings: {
      attractive: row.ratingAttractive,
      smart: row.ratingSmart,
      funny: row.ratingFunny,
      interesting: row.ratingInteresting
    },
    distanceKm: row.distanceKm,
    reasons: row.reasons ?? null
  }));

  console.log(JSON.stringify({ userId: userId.toString(), top: output }, null, 2));
}

main()
  .catch((err) => {
    console.error('Test failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
