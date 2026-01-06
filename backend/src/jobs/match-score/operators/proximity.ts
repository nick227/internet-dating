import { MatchOperator, MatchContext } from './types.js';
import { scoreProximity } from '../scoring/proximity.js';
import { clamp } from '../math/vectors.js';

export const ProximityOperator: MatchOperator = {
  key: 'proximity',
  weightKey: 'proximity',
  componentKey: 'scoreNearby',

  cheap(ctx: MatchContext): number {
    const { distanceKm } = ctx.candidate;
    if (distanceKm === null) return 0;
    
    const radius = ctx.prefs.preferredDistanceKm ?? ctx.prefs.defaultMaxDistanceKm;
    return clamp(1 - distanceKm / radius);
  },

  score(ctx: MatchContext) {
    const { distanceKm } = ctx.candidate;
    const score = scoreProximity(
      distanceKm,
      ctx.prefs.preferredDistanceKm,
      ctx.prefs.defaultMaxDistanceKm,
      ctx.viewer.locationText,
      ctx.candidate.locationText
    );

    return {
      score: score > 0 ? score : null, // null if no proximity signal
      meta: distanceKm !== null ? { distanceKm: Math.round(distanceKm * 10) / 10 } : undefined
    };
  }
};
