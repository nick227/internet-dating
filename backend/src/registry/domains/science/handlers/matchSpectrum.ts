import { Auth } from '../../../../lib/auth/rules.js';
import { json } from '../../../../lib/http/json.js';
import { parseLimit } from '../../../../lib/http/parse.js';
import { prisma } from '../../../../lib/prisma/client.js';
import type { RouteDef } from '../../../types.js';

type SampleCategory = 'BEST' | 'MIDDLE' | 'WORST';

export const matchSpectrumRoute: RouteDef = {
  id: 'science.GET./science/match-spectrum',
  method: 'GET',
  path: '/science/match-spectrum',
  auth: Auth.admin(),
  summary: 'Get sampled match pairs with live explanations',
  tags: ['science'],
  handler: async (req, res) => {
    const { range = 'all', limit, offset = '0' } = req.query;

    // Validate range
    const validRanges = ['best', 'middle', 'worst', 'all'];
    if (typeof range !== 'string' || !validRanges.includes(range)) {
      return json(res, { error: 'Invalid range. Must be: best, middle, worst, or all' }, 400);
    }

    // Parse limit
    const limitParsed = parseLimit(limit, 50, 100, 'limit');
    if (!limitParsed.ok) {
      return json(res, { error: limitParsed.error }, 400);
    }
    const take = limitParsed.value;

    // Parse offset
    const offsetNum = parseInt(String(offset), 10);
    if (isNaN(offsetNum) || offsetNum < 0) {
      return json(res, { error: 'Invalid offset' }, 400);
    }

    // Map range to category
    const categoryMap: Record<string, SampleCategory | undefined> = {
      best: 'BEST',
      middle: 'MIDDLE',
      worst: 'WORST',
      all: undefined
    };
    const category = categoryMap[range];

    // Get sampled pair IDs
    const samplePairs = await prisma.science_sample_pairs.findMany({
      where: category ? { sampleCategory: category } : undefined,
      orderBy: { matchScore: range === 'worst' ? 'asc' : 'desc' },
      take,
      skip: offsetNum,
      select: {
        user1Id: true,
        user2Id: true,
        sampledAt: true
      }
    });

    if (samplePairs.length === 0) {
      return json(res, {
        pairs: [],
        total: 0,
        sampledAt: null
      });
    }

    // Get total count for pagination
    const total = await prisma.science_sample_pairs.count({
      where: category ? { sampleCategory: category } : undefined
    });

    // Query v_match_explainer view for live explanations
    const pairConditions = samplePairs.map(p => 
      `(user1_id = ${p.user1Id} AND user2_id = ${p.user2Id})`
    ).join(' OR ');

    const explanations = await prisma.$queryRawUnsafe<Array<{
      user1_id: bigint;
      user2_id: bigint;
      match_score: number;
      score_quiz: number | null;
      score_interests: number | null;
      score_proximity: number | null;
      score_ratings: number | null;
      tier: string | null;
      distance_km: number | null;
      user1_email: string;
      user2_email: string;
      shared_interest_ids: string | null;
      shared_interest_count: number;
      is_matched: number;
      match_state: string | null;
      matched_at: Date | null;
    }>>`
      SELECT * FROM v_match_explainer
      WHERE ${pairConditions}
    `;

    // Get interest details for shared interests
    const allInterestIds = new Set<bigint>();
    for (const exp of explanations) {
      if (exp.shared_interest_ids) {
        const ids = exp.shared_interest_ids.split(',').map(id => BigInt(id));
        ids.forEach(id => allInterestIds.add(id));
      }
    }

    const interests = await prisma.interest.findMany({
      where: { id: { in: Array.from(allInterestIds) } },
      select: { id: true, label: true }
    });

    const interestMap = new Map(interests.map(i => [i.id.toString(), i.label]));

    // Format response
    const pairs = explanations.map(exp => {
      const sharedInterestIds = exp.shared_interest_ids 
        ? exp.shared_interest_ids.split(',') 
        : [];
      
      const sharedInterests = sharedInterestIds
        .filter(id => id)
        .map(id => ({
          id: Number(id),
          name: interestMap.get(id) ?? 'Unknown'
        }));

      return {
        user1: {
          id: Number(exp.user1_id),
          email: exp.user1_email
        },
        user2: {
          id: Number(exp.user2_id),
          email: exp.user2_email
        },
        matchScore: exp.match_score,
        scoreBreakdown: {
          quiz: exp.score_quiz ?? 0,
          interests: exp.score_interests ?? 0,
          proximity: exp.score_proximity ?? 0,
          ratings: exp.score_ratings ?? 0
        },
        tier: exp.tier,
        distanceKm: exp.distance_km,
        sharedInterests,
        sharedInterestCount: exp.shared_interest_count,
        isMatched: exp.is_matched === 1,
        matchState: exp.match_state,
        matchedAt: exp.matched_at?.toISOString()
      };
    });

    return json(res, {
      pairs,
      total,
      sampledAt: samplePairs[0]?.sampledAt.toISOString()
    });
  }
};
