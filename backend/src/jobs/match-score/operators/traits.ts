import { MatchOperator, MatchContext } from './types.js';
import { traitSimilarity } from '../scoring/traits.js';
import { quizSimilarity } from '../scoring/quiz.js';

export const TraitOperator: MatchOperator = {
  key: 'traits',
  weightKey: 'quiz', // Traits map to quiz weight (legacy compatibility)
  componentKey: 'scoreQuiz',

  score(ctx: MatchContext) {
    const { viewer, candidate, prefs } = ctx;
    
    // Calculate trait similarity (preferred over legacy quiz similarity)
    let traitSimResult: { value: number | null; coverage: number; commonCount: number } | null = null;
    
    if (viewer.traits.length > 0 && candidate.traits.length > 0) {
      traitSimResult = traitSimilarity(viewer.traits, candidate.traits);
      
      // Enforce minimum trait overlap threshold
      if (traitSimResult.commonCount < prefs.minTraitOverlap) {
        traitSimResult = null; // Treat as missing data
      }
    }

    // Fallback to legacy quiz similarity if no comparable trait data (null, not 0)
    let legacyQuizScore: number | null = null;
    let finalScore: number;
    
    if (traitSimResult?.value == null) {
      // No comparable trait data - use legacy quiz similarity
      if (viewer.quiz && candidate.quiz) {
        legacyQuizScore = quizSimilarity(viewer.quiz, candidate.quiz);
        finalScore = legacyQuizScore; // Valid score (0..1)
      } else {
        finalScore = 0.5; // Neutral baseline: missing data (no quiz)
      }
    } else {
      // Use trait similarity (even if value is 0 - that's a valid result, not missing)
      finalScore = traitSimResult.value; // Valid score (0..1, may be 0 for orthogonal)
    }

    return {
      score: finalScore,
      meta: {
        traitSim: traitSimResult?.value ?? null,
        traitCoverage: traitSimResult?.coverage,
        traitCommonCount: traitSimResult?.commonCount,
        quizSimLegacy: traitSimResult?.value == null ? legacyQuizScore : undefined
      }
    };
  }
};
