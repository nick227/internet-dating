import { MatchOperator, MatchContext } from './types.js';
import { scoreInterests, interestUpperBound } from '../scoring/interests.js';

export const InterestOperator: MatchOperator = {
  key: 'interests',
  weightKey: 'interests',
  componentKey: 'scoreInterests',

  cheap(ctx: MatchContext): number {
    // Upper bound for pruning (must overestimate)
    return interestUpperBound(ctx.viewer.interests.length, ctx.candidate.interests.length);
  },

  score(ctx: MatchContext) {
    const { overlap, matches, intersection, userCount, candidateCount } = scoreInterests(
      ctx.viewer.interests,
      ctx.candidate.interests
    );

    // If no interests recorded for either user, use neutral baseline
    // If interests exist but no overlap, use 0 (valid result)
    const score = (userCount === 0 || candidateCount === 0)
      ? 0.1 // Neutral baseline: missing data (no interests recorded)
      : overlap; // Valid score: 0 = no overlap, >0 = actual overlap

    return {
      score,
      meta: {
        matches: matches.slice(0, 5),
        intersection,
        userCount,
        candidateCount
      }
    };
  }
};
