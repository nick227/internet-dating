import { MatchOperator, MatchContext } from './types.js';
import { newnessScore } from '../math/stats.js';

export const NewnessOperator: MatchOperator = {
  key: 'newness',
  weightKey: 'newness',
  componentKey: 'scoreNew',

  cheap(ctx: MatchContext): number {
    const updatedAt = ctx.candidate.updatedAt ?? ctx.candidate.createdAt;
    return updatedAt ? newnessScore(updatedAt, ctx.prefs.newnessHalfLifeDays) : 0;
  },

  score(ctx: MatchContext) {
    const updatedAt = ctx.candidate.updatedAt ?? ctx.candidate.createdAt;
    const score = updatedAt ? newnessScore(updatedAt, ctx.prefs.newnessHalfLifeDays) : 0;
    return { score };
  }
};
