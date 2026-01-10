import type { JobDefinition } from '../../../src/lib/jobs/shared/types.js';
import { parseBigIntArg, parseIntArrayArg } from '../../../src/lib/jobs/shared/utils.js';
import { runQuizAnswerStatsJob } from '../../../src/jobs/quizAnswerStatsJob.js';

export const quizAnswerStatsJob: JobDefinition = {
  name: 'quiz-answer-stats',
  description: 'Aggregate quiz answer statistics by demographics',
  group: 'quiz',
  dependencies: [],
  examples: [
    'tsx scripts/jobs/runners/runJobs.ts quiz-answer-stats',
    'tsx scripts/jobs/runners/runJobs.ts quiz-answer-stats --quizId=1',
    'tsx scripts/jobs/runners/runJobs.ts quiz-answer-stats --quizId=1 --questionIds=1,2,3',
    'tsx scripts/jobs/runners/runJobs.ts quiz-answer-stats --fullRefresh'
  ],
  defaultParams: {
    fullRefresh: false
  },
  run: async () => {
    const quizId = parseBigIntArg('--quizId');
    const questionIds = parseIntArrayArg('--questionIds')?.map(id => BigInt(id));
    const fullRefresh = process.argv.includes('--fullRefresh');

    await runQuizAnswerStatsJob({
      quizId,
      questionIds: questionIds ?? null,
      fullRefresh
    });
  }
};
