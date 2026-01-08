import type { JobDefinition } from './types.js';
import { parseBigIntArg, parseIntArrayArg } from './utils.js';
import { runQuizAnswerStatsJob } from '../../src/jobs/quizAnswerStatsJob.js';

export const quizAnswerStatsJob: JobDefinition = {
  name: 'quiz-answer-stats',
  description: 'Aggregate quiz answer statistics by demographics',
  examples: [
    'tsx scripts/runJobs.ts quiz-answer-stats',
    'tsx scripts/runJobs.ts quiz-answer-stats --quizId=1',
    'tsx scripts/runJobs.ts quiz-answer-stats --quizId=1 --questionIds=1,2,3',
    'tsx scripts/runJobs.ts quiz-answer-stats --fullRefresh'
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
