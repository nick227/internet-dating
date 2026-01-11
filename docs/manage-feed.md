# Manage Feed Generation

This guide explains how feed generation works, how to publish a new feed sequence,
and how to verify changes (including mosaic presentation).

## How the feed is built

1) Config and sequence
   - `backend/src/registry/domains/feed/config.ts` defines the feed sequence, caps,
     and scoring weights.
   - The sequence assigns a `presentation` hint (for example `mosaic`) to posts and
     suggestions as items are ranked.
   - `mediaType` is derived in `backend/src/registry/domains/feed/candidates/posts.ts`:
     `mixed` is set only when a post has 2+ media items, `image` is set for a single
     image item.

2) Presort job (background)
   - `backend/src/jobs/feedPresortJob.ts` runs the presort pipeline:
     candidates -> scoring -> ranking -> dedup -> store segments.
   - Segments are stored in `presortedFeedSegment` with an `algorithmVersion`.

3) Feed retrieval (API)
   - `GET /api/feed` builds a viewer context, fetches relationship posts, then:
     - Uses presorted segment 0 (when no cursor) if valid.
     - Falls back to live computation if the segment is missing, expired, or invalid.
   - Lite mode (`?lite=1`) can serve cached `phase1Json` when available.

## Publish a new feed sequence

1) Update the sequence
   - Edit `backend/src/registry/domains/feed/config.ts`.
   - Update `sequence` entries (e.g., add `presentation: 'mosaic'`).

2) Bump the config version
   - Update `FEED_CONFIG_VERSION` in `backend/src/registry/domains/feed/config.ts`.
   - Ensure the presort validation version matches the version used for storage.
     If you keep a separate validation constant, update it too.

3) Rebuild presorted segments
   - For a single user:
     - `npx tsx backend/scripts/jobs/core/feedPresort.ts --userId=293 --incremental=false --noJitter`
   - For all users (schedule or manual):
     - `npx tsx backend/scripts/jobs/runners/runJobs.ts feed-presort --incremental=false`

4) Verify the API response
   - Generate a token (example uses `JWT_ACCESS_SECRET` from `backend/.env`):
     - `node -e "const jwt=require('jsonwebtoken'); console.log(jwt.sign({sub:'293'}, process.env.JWT_ACCESS_SECRET));"`
   - Call the feed:
     - `curl -H "Authorization: Bearer <token>" http://localhost:4000/api/feed`
   - Confirm the response includes `presentation.mode: "mosaic"` on expected items.

## Troubleshooting mosaic not showing

- No eligible posts
  - Mosaic can only appear for posts with `mediaType: "mixed"` (2+ media items)
    or `mediaType: "image"` (single image).
  - If your dataset is mostly video/text, mosaic will not appear.

- Stale presorted segments
  - If `FEED_CONFIG_VERSION` is not bumped, `feedPresortJob` can skip recompute
    and keep old items.
  - Invalidate segments or run presort with `--incremental=false`.

- Version mismatch
  - Presorted segments are validated against a version constant.
    If the validation version does not match the version used for storage, the
    API will ignore the presorted feed and fall back to the live path.

## Quick sanity checks

- Confirm which path is used:
  - Presorted path logs: `[feedService] Presorted feed used...`
  - Fallback path logs: `[feedService] Fallback feed used...`
- Inspect first 10 items:
  - Count `presentation.mode` values to see if mosaic is ever emitted.
