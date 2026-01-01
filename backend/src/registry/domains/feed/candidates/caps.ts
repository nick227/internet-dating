export const feedCandidateCaps = {
  posts: {
    maxLookbackDays: 7,
    maxItems: 500,
    selfMaxItems: 10,
    followingMaxItems: 50,
    followersMaxItems: 30
  },
  suggestions: {
    maxItems: 200,
    maxMatchItems: 3
  },
  questions: {
    maxItems: 5
  }
} as const;
