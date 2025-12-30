export const feedCandidateCaps = {
  posts: {
    maxLookbackDays: 7,
    maxItems: 500
  },
  suggestions: {
    maxItems: 200,
    maxMatchItems: 3
  },
  questions: {
    maxItems: 5
  }
} as const;
