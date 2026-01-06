export type InterestRow = {
  userId: bigint;
  subjectId: bigint;
  interestId: bigint;
  subjectKey: string;
  interestKey: string;
};

export type ViewerContext = {
  userId: bigint;
  profileId: bigint | null;
  lat: number | null;
  lng: number | null;
  locationText: string | null;
  traits: Array<{ traitKey: string; value: number; n: number }>;
  interests: InterestRow[];
  quiz: { quizId: bigint; answers: unknown; scoreVec: unknown } | null;
  ratings: {
    attractive: number | null;
    smart: number | null;
    funny: number | null;
    interesting: number | null;
    count: number;
  } | null;
};

export type CandidateContext = {
  userId: bigint;
  profileId: bigint;
  birthdate: Date | null;
  gender: string | null;
  lat: number | null;
  lng: number | null;
  locationText: string | null;
  createdAt: Date;
  updatedAt: Date;
  distanceKm: number | null;
  traits: Array<{ traitKey: string; value: number; n: number }>;
  interests: InterestRow[];
  quiz: { answers: unknown; scoreVec: unknown } | null;
  ratings: {
    attractive: number | null;
    smart: number | null;
    funny: number | null;
    interesting: number | null;
    count: number;
  } | null;
};

export type PreferencesContext = {
  preferredGenders: string[] | null;
  preferredAgeMin: number | null;
  preferredAgeMax: number | null;
  preferredDistanceKm: number | null;
  defaultMaxDistanceKm: number;
  ratingMax: number;
  newnessHalfLifeDays: number;
  minTraitOverlap: number;
  minRatingCount: number;
};

export type MatchContext = {
  viewer: ViewerContext;
  candidate: CandidateContext;
  prefs: PreferencesContext;
  now: Date;
};

export type MatchOperatorResult = {
  score: number | null;        // null = missing → neutral
  cheapScore?: number;         // optional, for pruning
  maxScore?: number;           // optional upper bound
  meta?: Record<string, unknown>;
};

export interface MatchOperator {
  key: string;
  
  // Maps operator to weight configuration key
  weightKey: 'quiz' | 'interests' | 'ratingQuality' | 'ratingFit' | 'newness' | 'proximity';
  
  // Maps operator to ScoreRow component field
  componentKey: 'scoreQuiz' | 'scoreInterests' | 'scoreRatingsQuality' | 'scoreRatingsFit' | 'scoreNew' | 'scoreNearby';

  // Hard exclusion (safety/invariants only)
  gate?(ctx: MatchContext): boolean;

  // Preference classification (returns compliance flag, not exclusion)
  classify?(ctx: MatchContext): boolean;

  // Fast estimate used only for pruning (upper bound estimation)
  cheap?(ctx: MatchContext): number;

  // Final expensive score
  score(ctx: MatchContext): MatchOperatorResult;
}
