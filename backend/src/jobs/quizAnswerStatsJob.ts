import { prisma } from '../lib/prisma/client.js';

type QuizAnswerStatsJobOptions = {
  quizId?: bigint | null;
  questionIds?: bigint[] | null;
  fullRefresh?: boolean;
};

const TOP_CITIES_COUNT = 20;

/**
 * Freeze top N cities at job start (per job run, not per quiz)
 * This ensures consistency for "other city" comparisons
 */
async function getTopCities(): Promise<string[]> {
  const cities = await prisma.profileSearchIndex.groupBy({
    by: ['locationCity'],
    where: {
      locationCity: { not: null },
      isVisible: true,
      isDeleted: false
    },
    _count: { userId: true },
    orderBy: { _count: { userId: 'desc' } },
    take: TOP_CITIES_COUNT
  });
  
  return cities
    .map(c => c.locationCity)
    .filter((city): city is string => city !== null);
}

/**
 * Calculate age bucket from ageBucket number
 */
function ageBucketToString(bucket: number | null): string | null {
  if (bucket === null) return null;
  const ranges = ['18-24', '25-34', '35-44', '45-54', '55+'];
  return ranges[bucket] ?? null;
}

/**
 * Process entire quiz - fetch all results once, build in-memory counters
 * CRITICAL: This scans QuizResult once per quiz, never per option
 */
export async function processQuizAnswerStats(
  quizId: bigint,
  topCities: string[],
  questionIds?: bigint[]
): Promise<void> {
  // Fetch quiz structure
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: {
      questions: {
        where: questionIds ? { id: { in: questionIds } } : undefined,
        select: {
          id: true,
          options: {
            select: { value: true }
          }
        }
      }
    }
  });

  if (!quiz || quiz.questions.length === 0) return;

  // Fetch ALL QuizResults for this quiz ONCE
  const allResults = await prisma.quizResult.findMany({
    where: { quizId },
    select: {
      userId: true,
      answers: true
    }
  });

  if (allResults.length === 0) {
    // No results, delete all stats for this quiz
    await prisma.quizAnswerStats.deleteMany({
      where: { quizId }
    });
    return;
  }

  // Fetch ALL user demographics ONCE
  const userIds = allResults.map(r => r.userId);
  const profiles = await prisma.profile.findMany({
    where: { userId: { in: userIds }, deletedAt: null },
    select: { userId: true, gender: true }
  });

  const searchIndex = await prisma.profileSearchIndex.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, ageBucket: true, locationCity: true }
  });

  const profileByUserId = new Map(profiles.map(p => [p.userId, p]));
  const searchIndexByUserId = new Map(searchIndex.map(s => [s.userId, s]));

  // Convert topCities to Set for O(1) lookup
  const topCitySet = new Set(topCities);

  // Build in-memory data structures
  // Structure: questionId -> optionValue -> dimension -> bucket -> count
  const counts = new Map<string, number>();
  // Structure: questionId -> dimension -> bucket -> total
  const totals = new Map<string, number>();

  // Process each result
  // NOTE: For very large quizzes (10k+ results), consider processing in chunks
  // to avoid memory pressure. Accumulate into the same maps across chunks.
  for (const result of allResults) {
    const { answers, userId } = result;
    const answerMap = answers as Record<string, string>;
    const profile = profileByUserId.get(userId);
    const idx = searchIndexByUserId.get(userId);

    const gender = profile?.gender ?? 'UNSPECIFIED';
    const { ageBucket, locationCity } = idx ?? { ageBucket: null, locationCity: null };
    const ageStr = ageBucket !== null ? ageBucketToString(ageBucket) : null;
    const city = locationCity && topCitySet.has(locationCity) ? locationCity : null;

    // Process each question
    for (const question of quiz.questions) {
      const { id: questionId } = question;
      const optionValue = answerMap[String(questionId)];

      if (!optionValue) continue; // User didn't answer this question

      // Increment counts for this option
      const countKey = `${questionId}:${optionValue}:site:ALL`;
      counts.set(countKey, (counts.get(countKey) ?? 0) + 1);

      // Gender is always truthy (defaults to 'UNSPECIFIED')
      const genderKey = `${questionId}:${optionValue}:gender:${gender}`;
      counts.set(genderKey, (counts.get(genderKey) ?? 0) + 1);

      if (ageStr) {
        const key = `${questionId}:${optionValue}:age:${ageStr}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      if (city) {
        const key = `${questionId}:${optionValue}:city:${city}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      // Increment totals for this question (all options)
      // CRITICAL: Totals are per question, not per option
      totals.set(`${questionId}:site:ALL`, (totals.get(`${questionId}:site:ALL`) ?? 0) + 1);

      // Gender is always truthy (defaults to 'UNSPECIFIED')
      totals.set(`${questionId}:gender:${gender}`, (totals.get(`${questionId}:gender:${gender}`) ?? 0) + 1);

      if (ageStr) {
        totals.set(`${questionId}:age:${ageStr}`, (totals.get(`${questionId}:age:${ageStr}`) ?? 0) + 1);
      }

      if (city) {
        totals.set(`${questionId}:city:${city}`, (totals.get(`${questionId}:city:${city}`) ?? 0) + 1);
      }
    }
  }

  // Now upsert all stats
  const statsToUpsert: Array<{
    quizId: bigint;
    questionId: bigint;
    optionValue: string;
    dimension: string;
    bucket: string;
    count: number;
    total: number;
  }> = [];

  for (const question of quiz.questions) {
    const questionId = question.id;
    
    for (const option of question.options) {
      const optionValue = option.value;

      // Site-wide
      const siteCount = counts.get(`${questionId}:${optionValue}:site:ALL`) ?? 0;
      const siteTotal = totals.get(`${questionId}:site:ALL`) ?? 0;
      if (siteTotal > 0) {
        statsToUpsert.push({
          quizId,
          questionId,
          optionValue,
          dimension: 'site',
          bucket: 'ALL',
          count: siteCount,
          total: siteTotal
        });
      }

      // Gender
      for (const gender of ['MALE', 'FEMALE', 'NONBINARY', 'OTHER', 'UNSPECIFIED'] as const) {
        const count = counts.get(`${questionId}:${optionValue}:gender:${gender}`) ?? 0;
        const total = totals.get(`${questionId}:gender:${gender}`) ?? 0;
        if (total > 0) {
          statsToUpsert.push({
            quizId,
            questionId,
            optionValue,
            dimension: 'gender',
            bucket: gender,
            count,
            total
          });
        }
      }

      // Age
      for (const ageStr of ['18-24', '25-34', '35-44', '45-54', '55+'] as const) {
        const count = counts.get(`${questionId}:${optionValue}:age:${ageStr}`) ?? 0;
        const total = totals.get(`${questionId}:age:${ageStr}`) ?? 0;
        if (total > 0) {
          statsToUpsert.push({
            quizId,
            questionId,
            optionValue,
            dimension: 'age',
            bucket: ageStr,
            count,
            total
          });
        }
      }

      // City (only top cities)
      for (const city of topCities) {
        const count = counts.get(`${questionId}:${optionValue}:city:${city}`) ?? 0;
        const total = totals.get(`${questionId}:city:${city}`) ?? 0;
        if (total > 0) {
          statsToUpsert.push({
            quizId,
            questionId,
            optionValue,
            dimension: 'city',
            bucket: city,
            count,
            total
          });
        }
      }
    }
  }

  // Batch upsert (delete old stats for affected questions first)
  if (questionIds && questionIds.length > 0) {
    await prisma.quizAnswerStats.deleteMany({
      where: {
        quizId,
        questionId: { in: questionIds }
      }
    });
  } else {
    // Full refresh - delete all stats for this quiz
    await prisma.quizAnswerStats.deleteMany({
      where: { quizId }
    });
  }

  // Upsert in batches (serialized to avoid write conflicts)
  const BATCH_SIZE = 100;
  for (let i = 0; i < statsToUpsert.length; i += BATCH_SIZE) {
    const batch = statsToUpsert.slice(i, i + BATCH_SIZE);
    // Serialize upserts to avoid write conflicts
    for (const stat of batch) {
      await prisma.quizAnswerStats.upsert({
        where: {
          quizId_questionId_optionValue_dimension_bucket: {
            quizId: stat.quizId,
            questionId: stat.questionId,
            optionValue: stat.optionValue,
            dimension: stat.dimension,
            bucket: stat.bucket
          }
        },
        update: {
          count: stat.count,
          total: stat.total
        },
        create: stat
      });
    }
  }
}

/**
 * Main job entry point
 */
export async function runQuizAnswerStatsJob(options: QuizAnswerStatsJobOptions = {}): Promise<void> {
  const topCities = await getTopCities();
  
  if (options.quizId) {
    await processQuizAnswerStats(options.quizId, topCities, options.questionIds ?? undefined);
  } else {
    // Process all active quizzes
    const quizzes = await prisma.quiz.findMany({
      where: { isActive: true },
      select: { id: true }
    });
    
    for (const quiz of quizzes) {
      await processQuizAnswerStats(quiz.id, topCities);
    }
  }
}
