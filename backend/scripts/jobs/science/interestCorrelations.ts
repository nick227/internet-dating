import type { JobDefinition } from '../lib/types.js';
import { prisma } from '../../../src/lib/prisma/client.js';

const MIN_SHARED_USERS = 3; // Minimum users required for correlation
const MIN_CORRELATION_SCORE = 0.05; // Minimum Jaccard score to store

export const scienceInterestCorrelationsJob: JobDefinition = {
  name: 'science-interest-correlations',
  description: 'Calculates interest correlation matrix using Jaccard similarity',
  group: 'maintenance',
  dependencies: [],
  examples: ['tsx scripts/jobs/runners/runJobs.ts science-interest-correlations'],
  defaultParams: {},
  run: async () => {
    console.log('[science-interest-correlations] Starting...');

    // Get all interests with at least MIN_SHARED_USERS
    const interests = await prisma.interest.findMany({
      select: { id: true }
    });

    console.log(`[science-interest-correlations] Processing ${interests.length} interests`);

    let correlationsCreated = 0;
    let correlationsUpdated = 0;

    // Process in batches to avoid memory issues
    const BATCH_SIZE = 50;
    
    for (let i = 0; i < interests.length; i += BATCH_SIZE) {
      const batch = interests.slice(i, i + BATCH_SIZE);
      
      for (const interestA of batch) {
        // Get all users with this interest
        const usersWithA = await prisma.userInterest.findMany({
          where: { interestId: interestA.id },
          select: { userId: true }
        });

        if (usersWithA.length < MIN_SHARED_USERS) continue;

        const userAIds = usersWithA.map(u => u.userId);

        // Find co-occurring interests
        const coOccurrences = await prisma.$queryRaw<Array<{
          interestId: bigint;
          sharedCount: bigint;
          totalUsers: bigint;
        }>>`
          SELECT 
            ui.interestId,
            COUNT(DISTINCT ui.userId) as sharedCount,
            (SELECT COUNT(DISTINCT userId) FROM UserInterest WHERE interestId = ui.interestId) as totalUsers
          FROM UserInterest ui
          WHERE ui.userId IN (${userAIds.join(',')})
            AND ui.interestId > ${interestA.id}
          GROUP BY ui.interestId
          HAVING sharedCount >= ${MIN_SHARED_USERS}
        `;

        for (const coOccur of coOccurrences) {
          const sharedCount = Number(coOccur.sharedCount);
          const totalB = Number(coOccur.totalUsers);
          const totalA = userAIds.length;

          // Jaccard similarity: |A ∩ B| / |A ∪ B|
          const union = totalA + totalB - sharedCount;
          const jaccardScore = union > 0 ? sharedCount / union : 0;

          if (jaccardScore < MIN_CORRELATION_SCORE) continue;

          // Calculate average match score for users sharing both interests
          const avgMatchScoreResult = await prisma.$queryRaw<Array<{ avgScore: number }>>`
            SELECT AVG(ms.score) as avgScore
            FROM MatchScore ms
            INNER JOIN UserInterest ui1 ON ui1.userId = ms.userId
            INNER JOIN UserInterest ui2 ON ui2.userId = ms.candidateUserId
            WHERE ui1.interestId = ${interestA.id}
              AND ui2.interestId = ${coOccur.interestId}
          `;

          const avgMatchScore = avgMatchScoreResult[0]?.avgScore ?? null;

          // Upsert correlation
          const result = await prisma.science_interest_correlations.upsert({
            where: {
              interestAId_interestBId: {
                interestAId: interestA.id,
                interestBId: coOccur.interestId
              }
            },
            create: {
              interestAId: interestA.id,
              interestBId: coOccur.interestId,
              sharedUserCount: sharedCount,
              correlationScore: jaccardScore,
              avgMatchScore,
              createdAt: new Date(),
              updatedAt: new Date()
            },
            update: {
              sharedUserCount: sharedCount,
              correlationScore: jaccardScore,
              avgMatchScore,
              updatedAt: new Date()
            }
          });

          if (result) {
            // Check if it was an insert or update (crude but works)
            if (result.createdAt.getTime() === result.updatedAt.getTime()) {
              correlationsCreated++;
            } else {
              correlationsUpdated++;
            }
          }
        }
      }

      console.log(`[science-interest-correlations] Processed batch ${i / BATCH_SIZE + 1} of ${Math.ceil(interests.length / BATCH_SIZE)}`);
    }

    console.log(`[science-interest-correlations] Complete.`);
    console.log(`  - Created: ${correlationsCreated}`);
    console.log(`  - Updated: ${correlationsUpdated}`);
  }
};
