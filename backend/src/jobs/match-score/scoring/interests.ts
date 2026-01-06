type InterestRow = {
  userId: bigint;
  subjectId: bigint;
  interestId: bigint;
  subjectKey: string;
  interestKey: string;
};

/**
 * Calculate interest similarity using Jaccard (overlap ratio)
 * Interests are categorical overlaps, not continuous signals
 */
export function scoreInterests(user: InterestRow[], candidate: InterestRow[]) {
  if (!user.length || !candidate.length) {
    return { overlap: 0, matches: [] as string[], intersection: 0, userCount: user.length, candidateCount: candidate.length };
  }

  const userKeys = new Set<string>();
  const labels = new Map<string, string>();
  for (const row of user) {
    const key = `${row.subjectId}:${row.interestId}`;
    userKeys.add(key);
    labels.set(key, `${row.subjectKey}:${row.interestKey}`);
  }

  const candidateKeys = new Set<string>();
  for (const row of candidate) {
    const key = `${row.subjectId}:${row.interestId}`;
    candidateKeys.add(key);
    if (!labels.has(key)) {
      labels.set(key, `${row.subjectKey}:${row.interestKey}`);
    }
  }

  // Calculate intersection
  let intersection = 0;
  const matches: string[] = [];
  for (const key of candidateKeys) {
    if (userKeys.has(key)) {
      intersection += 1;
      matches.push(labels.get(key) ?? key);
    }
  }

  // Calculate union for Jaccard similarity
  const union = userKeys.size + candidateKeys.size - intersection;
  const overlap = union > 0 ? intersection / union : 0; // Jaccard: |A ∩ B| / |A ∪ B|
  
  return {
    overlap,
    matches,
    intersection,
    userCount: userKeys.size,
    candidateCount: candidateKeys.size
  };
}

/**
 * Interest upper bound for pruning (must overestimate, never underestimate)
 * Returns maximum possible Jaccard similarity for pruning
 */
export function interestUpperBound(
  userInterestCount: number,
  candidateInterestCount: number
): number {
  // If either user has no interests, maximum possible overlap is 0
  if (userInterestCount === 0 || candidateInterestCount === 0) {
    return 0;
  }
  // Maximum possible Jaccard is 1.0 (all interests overlap)
  // Using 1.0 as upper bound is intentionally loose but safe for pruning
  return 1.0;
}
