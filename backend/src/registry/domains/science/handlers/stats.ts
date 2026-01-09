import { Auth } from '../../../../lib/auth/rules.js';
import { json } from '../../../../lib/http/json.js';
import { prisma } from '../../../../lib/prisma/client.js';
import type { RouteDef } from '../../../types.js';
import type { Decimal } from '@prisma/client/runtime/library.js';

export const statsRoute: RouteDef = {
  id: 'science.GET./science/stats',
  method: 'GET',
  path: '/science/stats',
  auth: Auth.admin(),
  summary: 'Get platform-wide daily statistics',
  tags: ['science'],
  handler: async (req, res) => {
    const { days = '30' } = req.query;

    // Parse days parameter
    const daysNum = parseInt(String(days), 10);
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) {
      return json(res, { error: 'Invalid days parameter. Must be between 1 and 365' }, 400);
    }

    // Calculate date range
    const endDate = new Date();
    endDate.setHours(0, 0, 0, 0);
    
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - daysNum);

    // Query daily stats
    const stats = await prisma.scienceDailyStats.findMany({
      where: {
        statDate: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { statDate: 'desc' }
    });

    // Format response
    const formattedStats = stats.map((s: {
      statDate: Date;
      scoreDist0to20: number;
      scoreDist20to40: number;
      scoreDist40to60: number;
      scoreDist60to80: number;
      scoreDist80to100: number;
      avgMatchScore: Decimal | null;
      medianMatchScore: Decimal | null;
      totalMatchPairs: number;
      totalMatches: number;
      matchRate: Decimal | null;
      avgDaysToMatch: Decimal | null;
      avgInterestsPerUser: Decimal | null;
      mostPopularInterests: unknown;
      createdAt: Date;
    }) => {
      let mostPopularInterests: Array<{ id: number; name: string; count: number }> = [];
      
      if (s.mostPopularInterests) {
        try {
          const parsed = typeof s.mostPopularInterests === 'string'
            ? JSON.parse(s.mostPopularInterests)
            : s.mostPopularInterests;
          mostPopularInterests = Array.isArray(parsed) ? parsed : [];
        } catch (err) {
          console.error('[science/stats] Failed to parse mostPopularInterests', err);
        }
      }

      return {
        date: s.statDate.toISOString().split('T')[0],
        matchScoreDistribution: {
          '0-20': s.scoreDist0to20,
          '20-40': s.scoreDist20to40,
          '40-60': s.scoreDist40to60,
          '60-80': s.scoreDist60to80,
          '80-100': s.scoreDist80to100
        },
        avgMatchScore: s.avgMatchScore,
        medianMatchScore: s.medianMatchScore,
        totalMatchPairs: s.totalMatchPairs,
        totalMatches: s.totalMatches,
        matchRate: s.matchRate,
        avgDaysToMatch: s.avgDaysToMatch,
        avgInterestsPerUser: s.avgInterestsPerUser,
        mostPopularInterests
      };
    });

    return json(res, {
      stats: formattedStats
    });
  }
};
