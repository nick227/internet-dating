function toNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const nums = value.map((entry) => (typeof entry === 'number' ? entry : null));
  if (nums.some((entry) => entry === null)) return null;
  return nums as number[];
}

function answersSimilarity(a: unknown, b: unknown): number {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return 0;
  const entriesA = Object.entries(a as Record<string, unknown>);
  if (!entriesA.length) return 0;
  let overlap = 0;
  let matches = 0;
  const mapB = new Map(Object.entries(b as Record<string, unknown>));
  for (const [key, value] of entriesA) {
    if (!mapB.has(key)) continue;
    overlap += 1;
    if (mapB.get(key) === value) {
      matches += 1;
    }
  }
  if (!overlap) return 0;
  return matches / overlap;
}

import { cosineSimilarity, clamp } from '../math/vectors.js';

type QuizRow = { answers: unknown; scoreVec: unknown };

export function quizSimilarity(userQuiz: QuizRow, candidateQuiz: QuizRow): number {
  const vecA = toNumberArray(userQuiz.scoreVec);
  const vecB = toNumberArray(candidateQuiz.scoreVec);
  if (vecA && vecB && vecA.length === vecB.length && vecA.length > 0) {
    // Normalize cosine similarity from [-1, 1] to [0, 1] to match trait similarity
    const cosine = cosineSimilarity(vecA, vecB);
    return clamp((cosine + 1) / 2); // maps [-1,1] → [0,1]
  }
  return answersSimilarity(userQuiz.answers, candidateQuiz.answers);
}
