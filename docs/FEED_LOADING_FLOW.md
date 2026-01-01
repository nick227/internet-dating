# Feed Loading Flow

## Overview

The feed uses a two-phase loading strategy backed by a shared store:
- Phase-1 (Lite): 1-2 cards with minimal fields for fast paint.
- Phase-2 (Full): full feed payload with media and stats.
- Shared store: module-level state read with `useSyncExternalStore`, so remounts do not reset the feed.
- Cache + TTL: Phase-1/Phase-2 snapshots cached with a TTL (60s dev, 5m prod).
- Auth safety: cache clears on auth change to avoid cross-user data.

## Component Hierarchy

```
App
  AppShell
    PageTransition
      ProtectedRoute
        FeedPage
          River
            useRiverFeedPhased
```

## Shared Store + State Machine

`frontend/src/core/feed/useRiverFeedPhased.ts` owns a tiny state machine:

- Statuses: `idle` -> `phase1-loading` -> `phase1-ready` -> `phase2-loading` -> `ready` (or `error`).
- Store fields: `items`, `cursor`, `loading`, `error`, `phase1Complete`, `status`, `lastUpdatedAt`, `lastPhase2At`.
- A single store instance dedupes fetches and survives route remounts.

## Step-by-Step Flow

### 1. Initial Render

- `frontend/src/ui/pages/FeedPage.tsx` renders `<River />`.
- `River` calls `useRiverFeedPhased()`.
- The hook reads from the shared store via `useSyncExternalStore`.

### 2. Store Hydration + Cache Check

On mount, the hook:
- Ensures auth-change subscription exists (clears cache on login/logout).
- Expires cache if TTL is exceeded.
- If a fresh Phase-2 snapshot exists, it is applied immediately.
- Else if a fresh Phase-1 snapshot exists, it is applied immediately.

### 3. Phase-1 Load (Lite)

Triggered when:
- Store is `idle`, no items, no error, and cache is empty or stale.

Data sources (priority):
1. Inline HTML: `<script id="phase1-feed" type="application/json">` if present.
2. API: `GET /api/feed?lite=1&limit=2`.

Results are cached as a Phase-1 snapshot (timestamped). In dev, the Phase-1 payload is also stored under `localStorage["phase1-feed-dev"]` so the Vite inline shell can replay the fast-boot path.

### 4. Phase-2 Load (Full)

Triggered after Phase-1 completes:
- Deferred with double `requestAnimationFrame` and `scheduler.postTask` (fallback to `setTimeout(0)`).
- If a fresh Phase-2 snapshot exists, it is reused.
- Otherwise: `GET /api/feed?cursorId=...` using the current store cursor.

Phase-2 replaces the store’s `items` and updates the cursor.

### 5. Infinite Scroll

`loadMore` only runs when:
- Status is `ready`.
- `cursor !== null`.

It fetches the next page, appends items, and updates the Phase-2 snapshot and cursor. The state machine prevents concurrent fetches.

## Cache Invalidation

- TTL: 60s (dev), 300s (prod).
- Auth change: `subscribeAuthChange` clears Phase-1/Phase-2 snapshots and resets store.
- Epoch guard: in-flight results are ignored after cache clears (prevents stale data).

## Debug Logs

Feed logs are gated in dev:
```
localStorage.setItem('debug:feed', '1')
```
This controls logging in:
- `useRiverFeedPhased`
- `usePhase1FromHTML`
- `api.feed`
- `adaptFeedResponse`

## API Response Formats

### Phase-1 (Lite)
```json
{
  "items": [
    {
      "id": "89",
      "kind": "post",
      "actor": { "id": "4", "name": "Nick", "avatarUrl": "https://..." },
      "textPreview": "Sunset rides, espresso runs...",
      "createdAt": 1735366897951,
      "presentation": { "mode": "single" }
    }
  ],
  "nextCursor": "65"
}
```

### Phase-2 (Full)
```json
{
  "items": [
    {
      "type": "post",
      "post": {
        "id": "89",
        "text": "Full text...",
        "createdAt": "2025-12-28T07:01:37.951Z",
        "user": { "id": "4", "profile": { "displayName": "Nick" } },
        "media": [ ... ],
        "stats": { ... }
      }
    }
  ],
  "nextCursor": "65"
}
```

## Performance Notes

- Inline Phase-1 HTML removes one RTT on first load.
- Shared store avoids refetch storms on remounts.
- Deferred Phase-2 keeps first paint smooth.
- Lazy media loading is handled at the card level.

## Key Files

- `frontend/src/ui/pages/FeedPage.tsx`
- `frontend/src/ui/river/River.tsx`
- `frontend/src/core/feed/useRiverFeedPhased.ts`
- `frontend/src/core/feed/usePhase1FromHTML.ts`
- `frontend/src/api/client.ts`
- `frontend/src/api/adapters.ts`

## Draft proposal

- `docs/FEED_RELATIONSHIP_FIRST_PROPOSAL.md`
