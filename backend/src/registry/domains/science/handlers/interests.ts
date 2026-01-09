import { Auth } from '../../../../lib/auth/rules.js';
import { json } from '../../../../lib/http/json.js';
import { parseLimit } from '../../../../lib/http/parse.js';
import { prisma } from '../../../../lib/prisma/client.js';
import type { RouteDef } from '../../../types.js';

export const interestsRoute: RouteDef = {
  id: 'science.GET./science/interests',
  method: 'GET',
  path: '/science/interests',
  auth: Auth.admin(),
  summary: 'Get interest popularity and correlations',
  tags: ['science'],
  handler: async (req, res) => {
    const { sortBy = 'popularity', limit, withCorrelations = 'false' } = req.query;

    // Validate sortBy
    const validSortBy = ['popularity', 'name'];
    if (typeof sortBy !== 'string' || !validSortBy.includes(sortBy)) {
      return json(res, { error: 'Invalid sortBy. Must be: popularity or name' }, 400);
    }

    // Parse limit
    const limitParsed = parseLimit(limit, 100, 500, 'limit');
    if (!limitParsed.ok) {
      return json(res, { error: limitParsed.error }, 400);
    }
    const take = limitParsed.value;

    // Parse withCorrelations
    const includeCorrelations = withCorrelations === 'true';

    // Query v_interest_popularity view
    const orderByClause = sortBy === 'name' 
      ? 'interest_name ASC' 
      : 'total_users DESC';

    const popularityData = await prisma.$queryRawUnsafe<Array<{
      interest_id: bigint;
      interest_name: string;
      interest_key: string;
      subject_name: string;
      total_users: bigint;
      percentage: number | null;
    }>>`
      SELECT * FROM v_interest_popularity
      ORDER BY ${orderByClause}
      LIMIT ${take}
    `;

    // Get latest update time from correlations table
    const latestCorrelation = await prisma.science_interest_correlations.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true }
    });

    // If correlations requested, fetch them
    const correlationsMap = new Map<string, Array<{
      interestId: number;
      correlationScore: number;
      sharedUsers: number;
    }>>();

    if (includeCorrelations && popularityData.length > 0) {
      const interestIds = popularityData.map(i => i.interest_id);
      
      // Get top 10 correlations for each interest
      const correlations = await prisma.science_interest_correlations.findMany({
        where: {
          OR: [
            { interestAId: { in: interestIds } },
            { interestBId: { in: interestIds } }
          ]
        },
        orderBy: { correlationScore: 'desc' },
        take: 1000 // Reasonable limit to avoid huge queries
      });

      // Organize by interest
      for (const corr of correlations) {
        const forInterestA = {
          interestId: Number(corr.interestBId),
          correlationScore: corr.correlationScore ?? 0,
          sharedUsers: corr.sharedUserCount
        };
        
        const forInterestB = {
          interestId: Number(corr.interestAId),
          correlationScore: corr.correlationScore ?? 0,
          sharedUsers: corr.sharedUserCount
        };

        const keyA = corr.interestAId.toString();
        const keyB = corr.interestBId.toString();

        if (!correlationsMap.has(keyA)) {
          correlationsMap.set(keyA, []);
        }
        if (!correlationsMap.has(keyB)) {
          correlationsMap.set(keyB, []);
        }

        correlationsMap.get(keyA)!.push(forInterestA);
        correlationsMap.get(keyB)!.push(forInterestB);
      }

      // Limit to top 10 per interest
      for (const [key, corrs] of correlationsMap.entries()) {
        correlationsMap.set(
          key,
          corrs.sort((a, b) => b.correlationScore - a.correlationScore).slice(0, 10)
        );
      }
    }

    // Format response
    const interests = popularityData.map(i => {
      const result: {
        id: number;
        name: string;
        key: string;
        subject: string;
        totalUsers: number;
        percentage: number | null;
        correlations?: Array<{
          interestId: number;
          correlationScore: number;
          sharedUsers: number;
        }>;
      } = {
        id: Number(i.interest_id),
        name: i.interest_name,
        key: i.interest_key,
        subject: i.subject_name,
        totalUsers: Number(i.total_users),
        percentage: i.percentage
      };

      if (includeCorrelations) {
        result.correlations = correlationsMap.get(i.interest_id.toString()) ?? [];
      }

      return result;
    });

    return json(res, {
      interests,
      updatedAt: latestCorrelation?.updatedAt.toISOString() ?? null
    });
  }
};
