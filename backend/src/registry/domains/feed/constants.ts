// Feed algorithm and system constants

// Presorted segment should have enough items to avoid thin feeds.
export const FEED_PRESORT_MIN_SEGMENT_ITEMS = 8;

export const FeedItemType = {
  POST: 'post',
  SUGGESTION: 'suggestion',
  QUESTION: 'question',
} as const;

export const FeedItemKind = {
  POST: 'post',
  PROFILE: 'profile',
  QUESTION: 'question',
} as const;

export const FeedSource = {
  POST: 'post',
  MATCH: 'match',
  SUGGESTED: 'suggested',
  QUESTION: 'question',
} as const;

export const FeedTier = {
  SELF: 'self',
  FOLLOWING: 'following',
  FOLLOWERS: 'followers',
  EVERYONE: 'everyone',
} as const;

export const SeenItemType = {
  POST: 'POST',
  SUGGESTION: 'SUGGESTION',
} as const;
