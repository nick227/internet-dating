import { parseIntArg, parseFlag, getEnvVar } from '../../../src/lib/jobs/shared/utils.js';
import { runStatsReconcileJob } from '../../../src/jobs/statsReconcileJob.js';
export const statsReconcileJob = {
    name: 'stats-reconcile',
    description: 'Reconcile statistics counters',
    group: 'maintenance',
    dependencies: [],
    examples: [
        'tsx scripts/jobs/runners/runJobs.ts stats-reconcile --lookbackHours=24 --batchSize=200 --pauseMs=50'
    ],
    defaultParams: {
        full: false,
        lookbackHours: 24,
        batchSize: 200,
        pauseMs: 50
    },
    run: async () => {
        const full = parseFlag('--full');
        const lookbackHours = parseIntArg('--lookbackHours', 24);
        const batchSize = parseIntArg('--batchSize', 200);
        const pauseMs = parseIntArg('--pauseMs', 50);
        const algorithmVersion = getEnvVar('STATS_RECONCILE_VERSION', 'v1');
        await runStatsReconcileJob({
            full,
            lookbackHours,
            batchSize,
            pauseMs,
            algorithmVersion
        });
    }
};
