import { MatchOperator, MatchContext } from './types.js';
import { scoreRatingQuality, scoreRatingFit } from '../scoring/ratings.js';

export const RatingQualityOperator: MatchOperator = {
  key: 'ratingQuality',
  weightKey: 'ratingQuality',
  componentKey: 'scoreRatingsQuality',

  score(ctx: MatchContext) {
    const score = scoreRatingQuality(
      ctx.candidate.ratings,
      ctx.prefs.ratingMax,
      ctx.prefs.minRatingCount
    );

    return {
      score,
      meta: ctx.candidate.ratings ? {
        attractive: ctx.candidate.ratings.attractive,
        smart: ctx.candidate.ratings.smart,
        funny: ctx.candidate.ratings.funny,
        interesting: ctx.candidate.ratings.interesting,
        count: ctx.candidate.ratings.count
      } : undefined
    };
  }
};

export const RatingFitOperator: MatchOperator = {
  key: 'ratingFit',
  weightKey: 'ratingFit',
  componentKey: 'scoreRatingsFit',

  score(ctx: MatchContext) {
    const score = scoreRatingFit(
      ctx.viewer.ratings,
      ctx.candidate.ratings,
      ctx.prefs.ratingMax,
      ctx.prefs.minRatingCount
    );

    return { score };
  }
};
