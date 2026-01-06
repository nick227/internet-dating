import { cosineSimilarity, toCenteredVector, toRatingVector, normalizeRating, averageRatings } from '../math/vectors.js';
import { clamp } from '../math/vectors.js';

export function scoreRatingQuality(
  ratingAgg: {
    attractive: number | null;
    smart: number | null;
    funny: number | null;
    interesting: number | null;
    count: number;
  } | null,
  ratingMax: number,
  minRatingCount: number
): number {
  if (!ratingAgg || ratingAgg.count < minRatingCount) {
    return 0.5; // Neutral baseline: missing/low-count data
  }
  const ratingQualityRaw = averageRatings(ratingAgg);
  return ratingQualityRaw != null ? (normalizeRating(ratingQualityRaw, ratingMax) ?? 0.5) : 0.5;
}

export function scoreRatingFit(
  viewerRatings: {
    attractive: number | null;
    smart: number | null;
    funny: number | null;
    interesting: number | null;
  } | null,
  candidateRatings: {
    attractive: number | null;
    smart: number | null;
    funny: number | null;
    interesting: number | null;
  } | null,
  ratingMax: number,
  minRatingCount: number
): number {
  if (!viewerRatings || !candidateRatings) {
    return 0.5; // Neutral baseline: missing viewer ratings
  }
  
  const viewerVector = toCenteredVector(toRatingVector(viewerRatings, ratingMax));
  const candidateVector = toCenteredVector(toRatingVector(candidateRatings, ratingMax));
  
  if (!viewerVector || !candidateVector) {
    return 0.5; // Neutral baseline: missing data
  }
  
  return clamp((cosineSimilarity(viewerVector, candidateVector) + 1) / 2);
}
