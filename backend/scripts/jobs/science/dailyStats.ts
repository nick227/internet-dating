import type { JobDefinition } from '../../../src/lib/jobs/shared/types.js';
import { prisma } from '../../../src/lib/prisma/client.js';

export const scienceDailyStatsJob: JobDefinition = {
  name: 'science-daily-stats',
  description: 'Calculates daily platform-wide aggregate statistics for Science page',
  group: 'maintenance',
  dependencies: ['match-scores'],
  examples: ['tsx scripts/jobs/runners/runJobs.ts science-daily-stats'],
  defaultParams: {},
  run: async () => {
    console.log('[science-daily-stats] Starting...');

    // Format date as YYYY-MM-DD for MySQL DATE column
    const now = new Date();
    const statDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Calculate match score distribution
    const scoreDistribution = await prisma.$queryRaw<Array<{
      bucket: string;
      count: bigint;
    }>>`
      SELECT
        CASE
          WHEN score >= 0 AND score < 20 THEN '0-20'
          WHEN score >= 20 AND score < 40 THEN '20-40'
          WHEN score >= 40 AND score < 60 THEN '40-60'
          WHEN score >= 60 AND score < 80 THEN '60-80'
          ELSE '80-100'
        END as bucket,
        COUNT(*) as count
      FROM MatchScore
      GROUP BY bucket
    `;

    const dist = {
      '0-20': 0,
      '20-40': 0,
      '40-60': 0,
      '60-80': 0,
      '80-100': 0
    };

    for (const row of scoreDistribution) {
      dist[row.bucket as keyof typeof dist] = Number(row.count);
    }

    // Calculate aggregate stats
    const matchStats = await prisma.matchScore.aggregate({
      _avg: { score: true },
      _count: { userId: true }
    });

  // Calculate median using a simpler MySQL-compatible approach
  const totalCount = await prisma.matchScore.count();
  
  let median: number | null = null;
  if (totalCount > 0) {
    const middleIndex = Math.floor(totalCount / 2);
    
    if (totalCount % 2 === 0) {
      // Even number: average of two middle values
      const middleScores = await prisma.matchScore.findMany({
        select: { score: true },
        orderBy: { score: 'asc' },
        skip: middleIndex - 1,
        take: 2
      });
      median = middleScores.length === 2 
        ? (middleScores[0].score + middleScores[1].score) / 2 
        : null;
    } else {
      // Odd number: single middle value
      const middleScore = await prisma.matchScore.findMany({
        select: { score: true },
        orderBy: { score: 'asc' },
        skip: middleIndex,
        take: 1
      });
      median = middleScore[0]?.score ?? null;
    }
  }

    // Calculate match metrics
    const totalMatches = await prisma.match.count({
      where: {
        state: 'ACTIVE'
      }
    });

    const totalMatchPairs = Number(matchStats._count.userId);
    const matchRate = totalMatchPairs > 0 
      ? (totalMatches / totalMatchPairs) * 100 
      : null;

    // Calculate average days to match
    const avgDaysResult = await prisma.$queryRaw<Array<{ avgDays: number }>>`
      SELECT AVG(DATEDIFF(m.createdAt, ms.createdAt)) as avgDays
      FROM \`Match\` m
      INNER JOIN MatchScore ms ON (
        (ms.userId = m.userAId AND ms.candidateUserId = m.userBId) OR
        (ms.userId = m.userBId AND ms.candidateUserId = m.userAId)
      )
      WHERE m.state = 'ACTIVE'
    `;

    const avgDaysToMatch = avgDaysResult[0]?.avgDays ?? null;

    // Calculate average interests per user
    const avgInterestsResult = await prisma.$queryRaw<Array<{ avg: number }>>`
      SELECT AVG(interest_count) as avg
      FROM (
        SELECT COUNT(*) as interest_count
        FROM UserInterest
        GROUP BY userId
      ) as user_interests
    `;

    const avgInterestsPerUser = avgInterestsResult[0]?.avg ?? null;

    // Get top 20 most popular interests
    const topInterests = await prisma.userInterest.groupBy({
      by: ['interestId'],
      _count: { userId: true },
      orderBy: { _count: { userId: 'desc' } },
      take: 20
    });

    const interestIds = topInterests.map(i => i.interestId);
    const interests = await prisma.interest.findMany({
      where: { id: { in: interestIds } },
      select: { id: true, label: true }
    });

    const interestMap = new Map(interests.map(i => [i.id, i.label]));
    
    const mostPopularInterests = topInterests.map(i => ({
      id: Number(i.interestId),
      name: interestMap.get(i.interestId) ?? 'Unknown',
      count: i._count.userId
    }));

    // Use raw SQL to avoid Prisma issues with DATE columns
    const dateString = statDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Check if record exists
    const existing = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM science_daily_stats WHERE statDate = ${dateString}
    `;
    
    if (Number(existing[0].count) > 0) {
      // Update existing record
      await prisma.$executeRaw`
        UPDATE science_daily_stats SET
          scoreDist0to20 = ${dist['0-20']},
          scoreDist20to40 = ${dist['20-40']},
          scoreDist40to60 = ${dist['40-60']},
          scoreDist60to80 = ${dist['60-80']},
          scoreDist80to100 = ${dist['80-100']},
          avgMatchScore = ${matchStats._avg.score},
          medianMatchScore = ${median},
          totalMatchPairs = ${totalMatchPairs},
          totalMatches = ${totalMatches},
          matchRate = ${matchRate},
          avgDaysToMatch = ${avgDaysToMatch},
          avgInterestsPerUser = ${avgInterestsPerUser},
          mostPopularInterests = ${JSON.stringify(mostPopularInterests)}
        WHERE statDate = ${dateString}
      `;
      console.log('[science-daily-stats] Updated existing record');
    } else {
      // Insert new record
      await prisma.$executeRaw`
        INSERT INTO science_daily_stats (
          statDate, scoreDist0to20, scoreDist20to40, scoreDist40to60, 
          scoreDist60to80, scoreDist80to100, avgMatchScore, medianMatchScore,
          totalMatchPairs, totalMatches, matchRate, avgDaysToMatch,
          avgInterestsPerUser, mostPopularInterests, createdAt
        ) VALUES (
          ${dateString}, ${dist['0-20']}, ${dist['20-40']}, ${dist['40-60']},
          ${dist['60-80']}, ${dist['80-100']}, ${matchStats._avg.score}, ${median},
          ${totalMatchPairs}, ${totalMatches}, ${matchRate}, ${avgDaysToMatch},
          ${avgInterestsPerUser}, ${JSON.stringify(mostPopularInterests)}, NOW()
        )
      `;
      console.log('[science-daily-stats] Created new record');
    }

    console.log(`[science-daily-stats] Complete. Stats for ${statDate.toISOString().split('T')[0]}`);
    console.log(`  - Avg match score: ${matchStats._avg.score?.toFixed(2)}`);
    console.log(`  - Total match pairs: ${totalMatchPairs}`);
    console.log(`  - Total matches: ${totalMatches}`);
    console.log(`  - Match rate: ${matchRate?.toFixed(2)}%`);
  }
};
