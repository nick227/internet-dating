# Feed Backend Guide

This doc explains the feed backend flow, the presort cache, and where the main
pieces live.

## High-level flow

1. The feed endpoint (`GET /api/feed`) loads a viewer context and chooses a
   response mode (lite vs full).
2. Presorted segments are fetched from storage when available; otherwise the
   normal feed service builds items on demand.
3. Lite responses return a minimal "phase-1" payload for fast initial render.
4. Full responses return hydrated items with complete data.
5. Seen tracking is recorded for posts and suggestions when `markSeen` is true.

## Key files and roles

### `backend/src/jobs/feedPresortPhase1.ts`
Builds a minimal "phase-1" JSON payload from presorted items. It maps items into
the lite shape used by `GET /feed?lite=1` and caps the inline JSON size.

### `backend/src/registry/domains/feed/config.ts`
Central feed configuration for sequencing, caps, and scoring weights. The
`FEED_CONFIG_VERSION` should be bumped whenever the sequence or weights change
to invalidate presorted cache segments.

### `backend/src/registry/domains/feed/transformers.ts`
Transforms hydrated feed items into the minimal phase-1 shape, and extracts the
next post cursor for pagination. This is used by the response builder when
returning lite responses.

### `backend/src/services/feed/presortedFeedService.ts`
Stores and retrieves presorted feed segments in the database. Also exposes
helpers for cache invalidation and expired segment cleanup.

### `backend/src/services/feed/presortedFeedHelpers.ts`
Applies seen penalties to presorted items and provides a fast check to see if
the top items are all unseen. Used to adjust ranking without rebuilding
segments.

### `backend/src/registry/domains/feed/hydration/presorted.ts`
Converts presorted items back into feed items and runs the standard hydration
pipeline so the response looks identical to the non-presorted path.

### `backend/src/lib/openapi/emitOpenApi.ts`
Generates the OpenAPI spec by combining the route registry with the schema map.
This is not feed-specific, but the feed endpoints are included in its schema
definitions.

## Lite response shape (Phase-1)

The lite response returns cards. Each card has a `cardType`, an optional
`presentation`, and an `items[]` array of leaf items.

```json
{
  "items": [
    {
      "cardType": "grid",
      "presentation": { "mode": "grid" },
      "items": [
        {
          "id": "123",
          "kind": "post",
          "actor": { "id": "456", "name": "User", "avatarUrl": null },
          "textPreview": "short text...",
          "createdAt": 1710000000000,
          "presentation": { "mode": "single", "accent": null }
        }
      ]
    }
  ],
  "nextCursorId": "123"
}
```

## Feed slots and presentation behavior

The feed is "sequence-first." Each slot in `feedConfig.sequence` emits a single
item of the specified kind (post, suggestion, question). The `presentation`
field is a UI hint only; it does not change how items are selected or grouped.

Important implications:
- A `presentation: "grid"` slot still emits one item. If the UI renders a grid
  card, it will use data from that single item unless you use the composite
  `kind: "grid"` slot.
- The composite grid slot (`kind: "grid"`) is the only backend path that groups
  multiple items into a single card payload.
- Diversity is enforced only via `caps.maxPerActor` and ranking logic. If the
  ranking surface is dominated by one actor, a single-item grid slot can still
  show that same actor.

### Can we render grid content from various users?

Yes. Two options:

1. Stronger per-actor diversity in ranking (raise the penalty or lower
   `caps.maxPerActor`) so sequential slots are less likely to be the same
   actor.
2. Use the composite `kind: "grid"` slot to group multiple items into one card
   (e.g., 4 posts from distinct actors).

### Can we combine suggestions into a grid?

Use the composite `kind: "grid"` slot with `of: "suggestion"` or a mixed `mix`
list to aggregate multiple suggestions into a single grid card.

## Proposal: composite grid slot type

Goal: allow a single feed slot to emit a structural "card" that contains
multiple items, each potentially from different actors and sources.

### Slot config shape

Add a new slot kind with an explicit item count. Grids are homogeneous by
default; set `mix` to opt into mixed content.

```ts
type FeedSlot =
  | { kind: 'post'; count: number; mediaType?: 'video' | 'image' | 'text' | 'mixed' | 'any'; presentation?: 'single' | 'mosaic' | 'grid' | 'highlight' }
  | { kind: 'suggestion'; count: number; source?: 'match' | 'suggested'; presentation?: 'single' | 'mosaic' | 'grid' | 'highlight' }
  | { kind: 'question'; count: number }
  | {
      kind: 'grid';
      // Total items to include in the composite card.
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
      // Optional mix constraints for the grid contents (opt-in).
      mix?: Array<
        | { type: 'post'; mediaType?: 'video' | 'image' | 'text' | 'mixed' | 'any' }
        | { type: 'suggestion'; source?: 'match' | 'suggested' }
        | { type: 'question' }
      >;
      // Diversity constraint within the grid.
      distinctActors?: boolean;
      presentation?: 'grid';
    };
```

Example:

```ts
const sequence: FeedSlot[] = [
  { kind: 'post', mediaType: 'any', count: 1, presentation: 'highlight' },
  { kind: 'grid', size: 4, minSize: 2, strict: false, of: 'post', mix: [{ type: 'post' }, { type: 'suggestion' }], distinctActors: true, presentation: 'grid' },
  { kind: 'question', count: 1 }
];
```

### Card payload (Phase-2)

The full response also emits cards. A card is structural; its `items[]` are
the atomic content payloads. Grids are just cards with multiple items.

```ts
type FeedItemLeaf =
  | { type: 'post'; post: FeedPost }
  | { type: 'suggestion'; suggestion: FeedSuggestion }
  | { type: 'question'; question: FeedQuestion };

type FeedCard =
  | {
      cardType: 'single';
      presentation: 'single' | 'highlight' | 'mosaic';
      items: [FeedItemLeaf];
    }
  | {
      cardType: 'grid';
      presentation: 'grid';
      items: FeedItemLeaf[];
    };
```

Phase-1 cards mirror the same structure:

```ts
type Phase1LeafItem = { kind: 'post' | 'profile' | 'question'; /* existing */ };

type Phase1Card =
  | {
      cardType: 'single';
      presentation?: { mode: 'single' | 'mosaic' | 'highlight' };
      items: [Phase1LeafItem];
    }
  | {
      cardType: 'grid';
      presentation?: { mode: 'grid' };
      items: Phase1LeafItem[];
    };
```

### Selection algorithm (concrete)

1. When a `grid` slot is encountered, select `size` items from the candidate
   pools using the same ranking rules as regular slots.
2. If `distinctActors` is true, enforce unique `actorId` within the grid items.
3. If `mix` is provided, alternate between the mix types while filling the
   grid, falling back to any available type if a specific pool is exhausted.
4. The grid card itself does not count as a single actor for `maxPerActor`,
   but each nested item does.
5. `minSize` sets the minimum viable grid. If fewer than `minSize`, the grid
   is skipped and candidates are not consumed.
6. `strict: true` is equivalent to `minSize === size`.
7. Grid selection is peek-and-commit: skipped candidates remain available for
   later slots if a grid cannot be completed.

### Cursor semantics

- Cursor always advances based on the most recent post ID found in the list,
  including posts inside grids.
- The grid wrapper itself never defines the cursor.

### Seen semantics

- Seen tracking and penalties apply per child item.
- Grid score derives from child scores after penalties (no "grid rot").

### Where changes land

- `backend/src/registry/domains/feed/config.ts`: add the new `grid` slot type.
- `backend/src/registry/domains/feed/services/feedService.ts`: handle `kind: 'grid'`
  and emit a composite item.
- `backend/src/registry/domains/feed/transformers.ts`: add Phase-1 transform for
  `type: 'grid'`.
- `backend/src/jobs/feedPresortPhase1.ts`: include `grid` items in cached phase-1.
- `backend/src/registry/domains/feed/hydration/presorted.ts`: hydrate nested items.
- `backend/src/lib/openapi/emitOpenApi.ts`: include grid items in `FeedItem` schema.

### Frontend implications

Grid cards become structural containers. The UI should render the nested items
individually (each with its own link) instead of treating the card as a single
actor or content source.

## Presorted segment storage

Each segment stores:
- A ranked list of items.
- Optional pre-serialized phase-1 JSON for segment 0.
- A computed timestamp, version, and expiry.

Segments are invalidated when the config version changes or related content
changes (posts, follows, suggestions).

## Current sequence

As of `FEED_CONFIG_VERSION = 'v9'`, the feed sequence includes a relaxed grid:

```ts
const sequence: FeedSlot[] = [
  { kind: 'post', mediaType: 'any', count: 1, presentation: 'highlight' },
  { kind: 'suggestion', count: 3, presentation: 'single' },
  { kind: 'grid', size: 4, minSize: 2, strict: false, of: 'post', mediaType: 'any', distinctActors: true, presentation: 'grid' },
  { kind: 'post', mediaType: 'any', count: 1, presentation: 'grid' },
  { kind: 'post', mediaType: 'any', count: 1, presentation: 'mosaic' },
  { kind: 'question', count: 1 },
  { kind: 'post', mediaType: 'any', count: 1, presentation: 'single' }
];
```
