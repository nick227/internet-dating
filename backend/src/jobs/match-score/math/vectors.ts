export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i]!;
    const bv = b[i]!;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function toCenteredVector(vector: number[] | null): number[] | null {
  if (!vector) return null;
  const mean = vector.reduce((sum, v) => sum + v, 0) / vector.length;
  const centered = vector.map((v) => v - mean);
  if (centered.every((v) => Math.abs(v) < 1e-6)) return null;
  return centered;
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeRating(value: number | null | undefined, ratingMax: number): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return clamp(value / ratingMax);
}

export function toRatingVector(
  avg: {
    attractive: number | null;
    smart: number | null;
    funny: number | null;
    interesting: number | null;
  },
  ratingMax: number
): number[] | null {
  const values = [avg.attractive, avg.smart, avg.funny, avg.interesting];
  if (values.every((value) => value == null)) return null;
  return values.map((value) => normalizeRating(value, ratingMax) ?? 0);
}

export function averageRatings(avg: {
  attractive: number | null;
  smart: number | null;
  funny: number | null;
  interesting: number | null;
}): number | null {
  const values = [avg.attractive, avg.smart, avg.funny, avg.interesting].filter(
    (value): value is number => typeof value === 'number'
  );
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}
