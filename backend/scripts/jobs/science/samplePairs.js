import { prisma } from '../../../src/lib/prisma/client.js';
const BEST_COUNT = 100;
const MIDDLE_COUNT = 100;
const WORST_COUNT = 100;
export const scienceSamplePairsJob = {
    name: 'science-sample-pairs',
    description: 'Samples representative match pairs across quality spectrum for Science page',
    group: 'maintenance',
    dependencies: ['match-scores'],
    examples: ['tsx scripts/jobs/runners/runJobs.ts science-sample-pairs'],
    defaultParams: {},
    run: async () => {
        console.log('[science-sample-pairs] Starting...');
        // Clear existing samples
        await prisma.$executeRaw `TRUNCATE TABLE science_sample_pairs`;
        console.log('[science-sample-pairs] Cleared existing samples');
        // Sample best matches (top 100 by score)
        const bestMatches = await prisma.matchScore.findMany({
            select: {
                userId: true,
                candidateUserId: true,
                score: true
            },
            orderBy: { score: 'desc' },
            take: BEST_COUNT
        });
        if (bestMatches.length > 0) {
            await prisma.scienceSamplePair.createMany({
                data: bestMatches.map(m => ({
                    user1Id: m.userId,
                    user2Id: m.candidateUserId,
                    matchScore: m.score,
                    sampleCategory: 'BEST',
                    sampledAt: new Date()
                }))
            });
            console.log(`[science-sample-pairs] Sampled ${bestMatches.length} best matches`);
        }
        // Sample middle matches (random 100 from score 40-60 range)
        const middleMatches = await prisma.$queryRaw `
      SELECT userId, candidateUserId, score
      FROM MatchScore
      WHERE score BETWEEN 40 AND 60
      ORDER BY RAND()
      LIMIT ${MIDDLE_COUNT}
    `;
        if (middleMatches.length > 0) {
            await prisma.scienceSamplePair.createMany({
                data: middleMatches.map(m => ({
                    user1Id: m.userId,
                    user2Id: m.candidateUserId,
                    matchScore: m.score,
                    sampleCategory: 'MIDDLE',
                    sampledAt: new Date()
                }))
            });
            console.log(`[science-sample-pairs] Sampled ${middleMatches.length} middle matches`);
        }
        // Sample worst matches (bottom 100 by score)
        const worstMatches = await prisma.matchScore.findMany({
            select: {
                userId: true,
                candidateUserId: true,
                score: true
            },
            orderBy: { score: 'asc' },
            take: WORST_COUNT
        });
        if (worstMatches.length > 0) {
            await prisma.scienceSamplePair.createMany({
                data: worstMatches.map(m => ({
                    user1Id: m.userId,
                    user2Id: m.candidateUserId,
                    matchScore: m.score,
                    sampleCategory: 'WORST',
                    sampledAt: new Date()
                }))
            });
            console.log(`[science-sample-pairs] Sampled ${worstMatches.length} worst matches`);
        }
        const totalSampled = bestMatches.length + middleMatches.length + worstMatches.length;
        console.log(`[science-sample-pairs] Complete. Total sampled: ${totalSampled}`);
    }
};
