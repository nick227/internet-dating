import type { JobDefinition } from './types.js';
import { prisma } from '../../src/lib/prisma/client.js';

const DEFAULT_BATCH_SIZE = 100;

/**
 * MIN_PAIR_COUNT
 * Minimum number of users required before two interests
 * are considered meaningfully related.
 */
const MIN_PAIR_COUNT = 2;

export const interestRelationshipsJob: JobDefinition = {
  name: 'interest-relationships',
  description: 'Incrementally builds interest-to-interest relationships from user co-selections',
  group: 'search',
  dependencies: [],
  examples: ['tsx scripts/runJobs.ts interest-relationships'],
  defaultParams: {},
  run: async () => {
    let processedInterests = 0;
    let relationshipsTouched = 0;

    // 1. Load dirty interests
    const dirtyRows = await prisma.interestDirty.findMany({
      take: DEFAULT_BATCH_SIZE,
      orderBy: { touchedAt: 'asc' }
    });

    if (dirtyRows.length === 0) {
      console.log('[interest-relationships] No dirty interests to process');
      return;
    }

    const dirtyInterestIds = dirtyRows.map(r => r.interestId);

    // 2. Load user selections for dirty interests
    const baseUserInterests = await prisma.userInterest.findMany({
      where: { interestId: { in: dirtyInterestIds } },
      select: { userId: true, interestId: true }
    });

    // interestId -> Set<userId>
    const usersByInterest = new Map<bigint, Set<bigint>>();
    for (const row of baseUserInterests) {
      let set = usersByInterest.get(row.interestId);
      if (!set) {
        set = new Set();
        usersByInterest.set(row.interestId, set);
      }
      set.add(row.userId);
    }

    // 3. Process each dirty interest independently
    for (const interestId of dirtyInterestIds) {
      try {
        const userSet = usersByInterest.get(interestId);
        if (!userSet || userSet.size === 0) {
          await prisma.interestDirty.delete({ where: { interestId } });
          continue;
        }

        const userIds = Array.from(userSet);
        const interestACount = userIds.length;

        // 4. Load co-occurring interests
        const coInterestRows = await prisma.userInterest.findMany({
          where: {
            userId: { in: userIds },
            interestId: { not: interestId }
          },
          select: { interestId: true }
        });

        // interestId -> pairCount
        const pairCounts = new Map<bigint, number>();
        for (const row of coInterestRows) {
          pairCounts.set(
            row.interestId,
            (pairCounts.get(row.interestId) ?? 0) + 1
          );
        }

        // Get unique other interest IDs
        const otherInterestIds = Array.from(pairCounts.keys());

        // Load actual user counts for all other interests
        const otherInterestUserCounts = await prisma.userInterest.groupBy({
          by: ['interestId'],
          where: { interestId: { in: otherInterestIds } },
          _count: { userId: true }
        });

        const userCountByInterest = new Map<bigint, number>();
        for (const row of otherInterestUserCounts) {
          userCountByInterest.set(row.interestId, row._count.userId);
        }

        // 5. Prepare relationship upserts
        const ops: Array<ReturnType<typeof prisma.interestRelationship.upsert>> = [];

        for (const [otherInterestId, pairCount] of pairCounts) {
          if (pairCount < MIN_PAIR_COUNT) continue;

          const interestAId =
            interestId < otherInterestId ? interestId : otherInterestId;
          const interestBId =
            interestId < otherInterestId ? otherInterestId : interestId;

          // Get actual user counts for both interests
          const otherInterestCount = userCountByInterest.get(otherInterestId) ?? 0;
          if (otherInterestCount === 0) continue; // Skip if no users have this interest

          // Assign counts correctly based on which is A and which is B
          const finalInterestACount = interestId < otherInterestId 
            ? interestACount  // interestId is A
            : otherInterestCount; // otherInterestId is A
          const finalInterestBCount = interestId < otherInterestId
            ? otherInterestCount  // otherInterestId is B
            : interestACount; // interestId is B

          const strengthAB = pairCount / finalInterestACount;
          const strengthBA = pairCount / finalInterestBCount;

          ops.push(
            prisma.interestRelationship.upsert({
              where: {
                interestAId_interestBId: {
                  interestAId,
                  interestBId
                }
              },
              create: {
                interestAId,
                interestBId,
                pairCount,
                interestACount: finalInterestACount,
                interestBCount: finalInterestBCount,
                strengthAB,
                strengthBA
              },
              update: {
                pairCount,
                interestACount: finalInterestACount,
                interestBCount: finalInterestBCount,
                strengthAB,
                strengthBA,
                updatedAt: new Date()
              }
            })
          );
        }

        if (ops.length > 0) {
          await prisma.$transaction(ops);
          relationshipsTouched += ops.length;
        }

        // 6. Clear dirty marker only after success
        await prisma.interestDirty.delete({ where: { interestId } });
        processedInterests += 1;

      } catch (err) {
        // Fail soft: do not delete dirty marker
        console.error(
          `[interest-relationships] failed for interest ${interestId.toString()}`,
          err
        );
      }
    }

    console.log(
      `[interest-relationships] Processed ${processedInterests} interests, touched ${relationshipsTouched} relationships`
    );
  }
};
