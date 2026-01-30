// Feed configuration is sequence-first.
// The sequence defines the structure; caps are safety rails only.

// FeedSlot describes the repeating order of cards within a response.
// A response = a single /api/feed call (one batch of items).
export type FeedSlot =
  | {
      // Pulls from feed posts.
      kind: 'post';
      // Number of times to emit this slot before moving on.
      count: number;
      // Restrict to posts by media type. "any" ignores type.
      mediaType?: 'video' | 'image' | 'text' | 'mixed' | 'any';
      // Optional presentation hint for the UI.
      presentation?: 'single' | 'mosaic' | 'grid' | 'highlight';
    }
  | {
      // Pulls from profile suggestions.
      kind: 'suggestion';
      count: number;
      // "match" = mutual like, "suggested" = non-match profile suggestion.
      source?: 'match' | 'suggested';
      presentation?: 'single' | 'mosaic' | 'grid' | 'highlight';
    }
  | {
      // Pulls from quiz questions (question cards).
      kind: 'question';
      count: number;
    }
  | {
      // Composite grid slot (structural card with multiple items).
      kind: 'grid';
      // Total items to include in the grid.
      size: number;
      // Minimum viable items to render the grid.
      minSize?: number;
      // Require exact size; set false to allow partial grids.
      strict?: boolean;
      // Default homogeneous content type for the grid.
      of: 'post' | 'suggestion' | 'question';
      // Optional post media filter when of === 'post'.
      mediaType?: 'video' | 'image' | 'text' | 'mixed' | 'any';
      // Optional suggestion filter when of === 'suggestion'.
      source?: 'match' | 'suggested';
      // Optional mix constraints (opt-in mixed grids).
      mix?: Array<
        | { type: 'post'; mediaType?: 'video' | 'image' | 'text' | 'mixed' | 'any' }
        | { type: 'suggestion'; source?: 'match' | 'suggested' }
        | { type: 'question' }
      >;
      // Enforce unique actors within the grid if true.
      distinctActors?: boolean;
      presentation?: 'grid';
    };

export type FeedCaps = {
  // Hard limit on items returned per response.
  maxItemsPerResponse: number;
  // Hard limit on how many cards one actor can occupy in a response.
  maxPerActor: number;
};

export type FeedConfig = {
  // The sequence is the primary controller of distribution.
  sequence: FeedSlot[];
  // Caps are guardrails, not structure.
  caps: FeedCaps;
  // Seen demotion window (ranking-only, never eligibility).
  seenWindowHours: number;
  scoring: {
    weights: {
      // Recency is the main post signal until jobs are live.
      recency: number;
      affinity: number;
      quality: number;
      // Seen penalty is a soft demotion, not exclusion.
      seenPenalty: number;
    };
  };
};

// Sequence-first configuration:
// Example: 2 video posts -> 1 mosaic post (image or mixed) -> 1 suggestion -> 1 quiz -> repeat.
const sequence: FeedSlot[] = [
  { kind: 'post', mediaType: 'any', count: 1, presentation: 'highlight' },
  { kind: 'suggestion', count: 3, presentation: 'single' },
  { kind: 'grid', size: 3, minSize: 3, strict: false, of: 'suggestion', mediaType: 'any', distinctActors: true, presentation: 'grid' },
  { kind: 'post', mediaType: 'any', count: 1, presentation: 'grid' },
  { kind: 'post', mediaType: 'any', count: 1, presentation: 'mosaic' },
  { kind: 'question', count: 1 },
  { kind: 'post', mediaType: 'any', count: 1, presentation: 'single' }
];

// Config affects ranking/merging only, never candidate inclusion.
export const feedConfig = {
  sequence,
  caps: {
    maxItemsPerResponse: 5,
    maxPerActor: 3
  },
  seenWindowHours: 24,
  scoring: {
    weights: {
      recency: 0.6,
      affinity: 0.3,
      quality: 0.1,
      seenPenalty: 0.2
    }
  }
} as const satisfies FeedConfig;

// Bump this version whenever you modify the sequence or weights
// to ensure the presort job invalidates its cache.
export const FEED_CONFIG_VERSION = 'v9';
