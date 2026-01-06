import { prisma } from '../../../../lib/prisma/client.js';

/**
 * Lightweight on-demand scoring for new users.
 * Only computes quiz + distance scores (fast, no ratings/interests).
 * Full job should be enqueued async after this returns.
 */
export async function computeLightweightScores(
  userId: bigint,
  limit: number
): Promise<Array<{
  candidateUserId: bigint;
  score: number;
  distanceKm: number | null;
  reasons: Record<string, unknown>;
}>> {
  // Get user's quiz answers
  const userQuiz = await prisma.quizResult.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { answers: true }
  });

  if (!userQuiz?.answers || typeof userQuiz.answers !== 'object') {
    // No quiz data - return empty (can't score)
    return [];
  }

  const userAnswers = userQuiz.answers as Record<string, unknown>;

  // Get user's location
  const userProfile = await prisma.profile.findUnique({
    where: { userId },
    select: { lat: true, lng: true }
  });

  const userLat = userProfile?.lat ? Number(userProfile.lat) : null;
  const userLng = userProfile?.lng ? Number(userProfile.lng) : null;

  // Get candidate profiles (visible, not deleted, not self)
  const candidates = await prisma.profile.findMany({
    where: {
      userId: { not: userId },
      deletedAt: null,
      isVisible: true,
      user: { deletedAt: null }
    },
    select: {
      userId: true,
      lat: true,
      lng: true
    },
    take: limit * 3 // Over-fetch to account for filtering
  });

  // Score each candidate
  const scored: Array<{
    candidateUserId: bigint;
    score: number;
    distanceKm: number | null;
    reasons: Record<string, unknown>;
  }> = [];

  for (const candidate of candidates) {
    let score = 0;
    const reasons: Record<string, unknown> = {};

    // Quiz similarity (simple overlap)
    const candidateQuiz = await prisma.quizResult.findFirst({
      where: { userId: candidate.userId },
      orderBy: { createdAt: 'desc' },
      select: { answers: true }
    });

    if (candidateQuiz?.answers && typeof candidateQuiz.answers === 'object') {
      const candidateAnswers = candidateQuiz.answers as Record<string, unknown>;
      let matches = 0;
      let overlap = 0;

      for (const [key, value] of Object.entries(userAnswers)) {
        if (key in candidateAnswers) {
          overlap++;
          if (candidateAnswers[key] === value) {
            matches++;
          }
        }
      }

      if (overlap > 0) {
        const quizScore = matches / overlap;
        score += quizScore * 0.5; // 50% weight for quiz
        reasons.quizSimilarity = quizScore;
        reasons.quizMatches = matches;
        reasons.quizOverlap = overlap;
      }
    }

    // Distance score
    if (userLat !== null && userLng !== null && candidate.lat && candidate.lng) {
      const distanceKm = haversineKm(
        userLat,
        userLng,
        Number(candidate.lat),
        Number(candidate.lng)
      );

      // Inverse distance score (closer = higher, max 100km)
      const maxDistance = 100;
      const distanceScore = distanceKm <= maxDistance
        ? 1 - (distanceKm / maxDistance)
        : 0;

      score += distanceScore * 0.5; // 50% weight for distance
      reasons.distanceKm = Math.round(distanceKm * 10) / 10;
      reasons.distanceScore = distanceScore;
    }

    if (score > 0) {
      scored.push({
        candidateUserId: candidate.userId,
        score,
        distanceKm: userLat !== null && userLng !== null && candidate.lat && candidate.lng
          ? haversineKm(userLat, userLng, Number(candidate.lat), Number(candidate.lng))
          : null,
        reasons: {
          source: 'lightweight',
          lightweight: true,
          ...reasons
        }
      });
    }
  }

  // Sort by score descending and return top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}
