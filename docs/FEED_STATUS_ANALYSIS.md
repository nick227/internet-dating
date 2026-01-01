# Feed status analysis

## Summary
The feed now prioritizes relationship content (self, following, followers) ahead of the global pool, with hard tier ordering enforced at request time. Presort remains a global filler that is bypassed on cursor requests and does not block immediate self visibility.

## Current behavior
- Tier order is hard: SELF -> FOLLOWING -> FOLLOWERS -> EVERYONE.
- Self posts are always included (no visibility filtering).
- Following posts include PRIVATE when access is GRANTED.
- Followers are PUBLIC only.
- Everyone is PUBLIC only.
- Presort is used only when there is no cursor; cursor requests always hit live candidates.
- Seen tracking runs on both presort and live paths.
- `take` and `nextCursorId` are now consistent across backend and frontend.

## Implemented changes (highlights)
- Backend feed handler merges relationship items before ranked items and tracks tier metadata.
- Relationship lookup uses profile access (GRANTED only).
- Presort path respects cursor (bypass on cursorId).
- Presort and fallback paths both record seen entries.
- Presort items are tagged as `everyone` tier on hydration.
- Frontend feed cache busting after post creation; Phase 1 uses `nextCursorId`.
- Tests updated to reflect video-first sequence and relationship ordering/visibility.

## Known constraints and risks
- Feed sequence is video-first; posts without media may not appear unless sequence is adjusted or media fallback is added.
- Presort is still global-only; relationship content is live-only, so presort can be stale without invalidation.
- Cursoring is based on post ID and creation time; non-post items (suggestions/questions) do not drive cursor advancement.

## Testing
- Backend test suite passes (`npm --prefix backend run test`).

## Remaining doc updates
- `docs/FEED_LOADING_FLOW.md` and `docs/feed-jobs-system.md` should be updated to match the relationship-first flow and presort behavior once final behavior is locked.
