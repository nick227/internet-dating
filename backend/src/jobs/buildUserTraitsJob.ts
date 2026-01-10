import { prisma } from '../lib/prisma/client.js';
import { Prisma } from '@prisma/client';
import { runJob } from '../lib/jobs/runJob.js';
import { isFullRun } from '../lib/jobs/shared/freshness.js';

type BuildUserTraitsJobConfig = {
  userBatchSize: number;
  pauseMs: number;
  algorithmVersion: string;
};

type BuildUserTraitsJobOptions = Partial<BuildUserTraitsJobConfig> & {
  userId?: bigint | null;
};

const DEFAULT_CONFIG: BuildUserTraitsJobConfig = {
  userBatchSize: 100,
  pauseMs: 50,
  algorithmVersion: 'v1'
};

function sleep(ms: number) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolveConfig(overrides: BuildUserTraitsJobOptions = {}): BuildUserTraitsJobConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides
  };
}

/**
 * Parses traitValues JSON from QuizOption
 * Expected format: {"personality.funny": 2, "personality.nice": -5}
 */
function parseTraitValues(traitValues: unknown): Map<string, number> {
  const result = new Map<string, number>();
  if (!traitValues || typeof traitValues !== 'object') return result;
  
  const obj = traitValues as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (typeof key === 'string' && typeof value === 'number' && Number.isFinite(value)) {
      // Clamp values to -10 to +10 range
      const clamped = Math.max(-10, Math.min(10, value));
      result.set(key, clamped);
    }
  }
  return result;
}

/**
 * Aggregates trait values from all quiz answers for a user
 * Returns a map of traitKey -> { value: number, n: number }
 * where value is the mean and n is the contribution count
 */
async function aggregateUserTraits(userId: bigint): Promise<Map<string, { value: number; n: number }>> {
  const traitAccumulator = new Map<string, { sum: number; count: number }>();

  // Fetch all quiz results for this user
  const quizResults = await prisma.quizResult.findMany({
    where: { userId },
    select: {
      quizId: true,
      answers: true
    }
  });

  if (quizResults.length === 0) {
    return new Map();
  }

  // For each quiz result, process all answers
  for (const result of quizResults) {
    const answers = result.answers as Record<string, unknown>;
    
    // Fetch all questions and options for this quiz
    const quiz = await prisma.quiz.findUnique({
      where: { id: result.quizId },
      select: {
        questions: {
          select: {
            id: true,
            options: {
              select: {
                id: true,
                value: true,
                traitValues: true
              }
            }
          }
        }
      }
    });

    if (!quiz) continue;

    // Build a map of questionId -> option value -> traitValues
    const optionTraitMap = new Map<string, Map<string, Map<string, number>>>();
    
    for (const question of quiz.questions) {
      const questionId = question.id.toString();
      const questionMap = new Map<string, Map<string, number>>();
      
      for (const option of question.options) {
        const traitValues = parseTraitValues(option.traitValues);
        questionMap.set(option.value, traitValues);
      }
      
      optionTraitMap.set(questionId, questionMap);
    }

    // Process each answer
    for (const [questionId, answerValue] of Object.entries(answers)) {
      const questionMap = optionTraitMap.get(questionId);
      if (!questionMap) continue;

      const traitValues = questionMap.get(String(answerValue));
      if (!traitValues) continue;

      // Accumulate trait values
      for (const [traitKey, traitValue] of traitValues.entries()) {
        const existing = traitAccumulator.get(traitKey);
        if (existing) {
          existing.sum += traitValue;
          existing.count += 1;
        } else {
          traitAccumulator.set(traitKey, { sum: traitValue, count: 1 });
        }
      }
    }
  }

  // Calculate averages and return with count (n)
  const aggregated = new Map<string, { value: number; n: number }>();
  for (const [traitKey, { sum, count }] of traitAccumulator.entries()) {
    if (count > 0) {
      aggregated.set(traitKey, { value: sum / count, n: count });
    }
  }

  return aggregated;
}

/**
 * Builds or rebuilds user traits for a single user
 */
async function buildUserTraits(userId: bigint, config: BuildUserTraitsJobConfig) {
  if (isFullRun()) {
    const aggregatedTraits = await aggregateUserTraits(userId);

    await prisma.userTrait.deleteMany({
      where: { userId }
    });

    if (aggregatedTraits.size > 0) {
      await prisma.userTrait.createMany({
        data: Array.from(aggregatedTraits.entries()).map(([traitKey, { value, n }]) => ({
          userId,
          traitKey,
          value: new Prisma.Decimal(value),
          n
        })),
        skipDuplicates: true
      });
    }
    return;
  }

  const [latestQuiz, latestTrait] = await Promise.all([
    prisma.quizResult.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true }
    }),
    prisma.userTrait.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true }
    })
  ]);

  if (!latestQuiz) {
    if (latestTrait) {
      await prisma.userTrait.deleteMany({ where: { userId } });
    }
    return;
  }

  if (latestTrait && latestTrait.updatedAt >= latestQuiz.updatedAt) {
    return;
  }

  const aggregatedTraits = await aggregateUserTraits(userId);

  // Delete existing traits for this user
  await prisma.userTrait.deleteMany({
    where: { userId }
  });

  // Insert new traits with n (contribution count)
  if (aggregatedTraits.size > 0) {
    await prisma.userTrait.createMany({
      data: Array.from(aggregatedTraits.entries()).map(([traitKey, { value, n }]) => ({
        userId,
        traitKey,
        value: new Prisma.Decimal(value),
        n
      })),
      skipDuplicates: true
    });
  }
}

/**
 * Builds user traits for all users (or a specific user if userId is provided)
 */
export async function buildUserTraitsForAll(config: BuildUserTraitsJobOptions = {}) {
  const resolvedConfig = resolveConfig(config);
  
  await runJob(
    {
      jobName: 'build-user-traits',
      trigger: config.userId ? 'MANUAL' : 'CRON',
      scope: config.userId?.toString() ?? null,
      algorithmVersion: resolvedConfig.algorithmVersion
    },
    async () => {
      if (config.userId) {
        // Single user
        await buildUserTraits(config.userId, resolvedConfig);
        return { processedUsers: 1 };
      }

      // Batch process all users with quiz results
      let processedUsers = 0;
      let cursor: bigint | null = null;
      const batchSize = resolvedConfig.userBatchSize;

      while (true) {
        const users: Array<{ id: bigint }> = await prisma.user.findMany({
          where: {
            deletedAt: null,
            quizResults: { some: {} },
            ...(cursor ? { id: { gt: cursor } } : {})
          },
          select: { id: true },
          take: batchSize,
          orderBy: { id: 'asc' }
        });

        if (users.length === 0) break;

        for (const user of users) {
          try {
            await buildUserTraits(user.id, resolvedConfig);
            processedUsers += 1;
          } catch (err) {
            console.error(`Failed to build traits for user ${user.id}:`, err);
            // Continue with next user
          }

          if (resolvedConfig.pauseMs > 0) {
            await sleep(resolvedConfig.pauseMs);
          }
        }

        if (users.length < batchSize) break;
        cursor = users[users.length - 1]!.id;
      }

      return { processedUsers };
    }
  );
}

/**
 * Convenience function to rebuild traits for a single user
 * Typically called after a user submits/updates quiz answers
 */
export async function rebuildUserTraits(userId: bigint) {
  return buildUserTraitsForAll({ userId });
}
