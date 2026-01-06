import { MatchOperator, MatchContext } from './types.js';
import { computeAge } from '../math/stats.js';

export const GenderGate: MatchOperator = {
  key: 'gender',
  weightKey: 'quiz', // Not used for gates, but required by interface
  componentKey: 'scoreQuiz', // Not used for gates, but required by interface

  // Keep gate() for backward compatibility (can delegate to classify)
  gate(ctx: MatchContext): boolean {
    return this.classify!(ctx);
  },

  // Classification (not exclusion): returns compliance flag
  classify(ctx: MatchContext): boolean {
    const { preferredGenders } = ctx.prefs;
    if (!preferredGenders?.length) return true; // No preference = within
    if (!ctx.candidate.gender) return false; // Missing gender = outside
    return preferredGenders.includes(ctx.candidate.gender);
  }
};

export const AgeGate: MatchOperator = {
  key: 'age',
  weightKey: 'quiz', // Not used for gates, but required by interface
  componentKey: 'scoreQuiz', // Not used for gates, but required by interface

  // Keep gate() for backward compatibility (can delegate to classify)
  gate(ctx: MatchContext): boolean {
    return this.classify!(ctx);
  },

  // Classification (not exclusion): returns compliance flag
  classify(ctx: MatchContext): boolean {
    const { preferredAgeMin, preferredAgeMax } = ctx.prefs;
    const candidateAge = computeAge(ctx.candidate.birthdate);
    
    // If preferences exist but age is missing, classify as outside
    if ((preferredAgeMin !== null || preferredAgeMax !== null) && candidateAge === null) {
      return false;
    }
    
    // Check min age
    if (preferredAgeMin !== null && candidateAge !== null && candidateAge < preferredAgeMin) {
      return false;
    }
    
    // Check max age
    if (preferredAgeMax !== null && candidateAge !== null && candidateAge > preferredAgeMax) {
      return false;
    }
    
    return true;
  }
};

export const DistanceGate: MatchOperator = {
  key: 'distance',
  weightKey: 'quiz', // Not used for gates, but required by interface
  componentKey: 'scoreQuiz', // Not used for gates, but required by interface

  // Keep gate() for backward compatibility (can delegate to classify)
  gate(ctx: MatchContext): boolean {
    return this.classify!(ctx);
  },

  // Classification (not exclusion): returns compliance flag
  // STRICT: Missing distance = outside preference (but still scorable via text fallback)
  classify(ctx: MatchContext): boolean {
    const { preferredDistanceKm } = ctx.prefs;
    const { distanceKm } = ctx.candidate;
    
    // If no preference, classify as within
    if (preferredDistanceKm === null) return true;
    
    // STRICT: If no distance data, classify as outside
    // This ensures missing geo ≠ within preference
    // Candidate is still scorable via text fallback in scoring
    if (distanceKm === null) return false;
    
    // Classify based on distance
    return distanceKm <= preferredDistanceKm;
  }
};
