# Relationship-first feed proposal

## Goals

- Always show self posts immediately.
- Prioritize relationships over global ranking.
- Keep presort as a fast global filler, not the source of truth.
- Fix pagination and seen updates on presort paths.
- Align API naming between frontend and backend.

## Tier model (hard ordering)

Define four tiers:

1. SELF
2. FOLLOWING (viewer -> author)
3. FOLLOWERS (author -> viewer)
4. EVERYONE

Rules:

- Tier order is absolute.
- Scoring applies only within a tier.
- Self is always included, regardless of visibility.
- Priority applies to all pages (not just page 1).

## Candidate selection (request time)

Always fetch these first (live, no presort):

- Self posts (last N, higher cap).
- Following posts.
- Follower posts.

Then fill the remainder from:

- Presorted global pool, or
- Fallback global query.

This guarantees freshness without sacrificing presort performance.

## Visibility rules

- Self: all posts.
- Following / followers: PUBLIC, plus PRIVATE when access is GRANTED.
- Everyone: PUBLIC only.
- PENDING access never appears in feed.

## Presort changes (critical)

Presort must either:

- include tier signals, or
- be bypassed when `cursorId` exists, or
- only contribute to the EVERYONE tier.

Also required:

- Fix pagination so presort respects cursoring.
- Update seen penalties even on presort paths.

## Invalidation strategy (MVP)

Trigger invalidation on:

- Post create.
- Follow / unfollow.
- Access grant / revoke.

Actions:

- Clear presorted segments for affected users.
- Bust frontend feed cache immediately after posting.

This is lightweight and does not require full fan-out at first.

## API alignment (cleanup)

- Standardize on `take`.
- Return `nextCursorId`.
- Update `docs/FEED_LOADING_FLOW.md` after behavior is finalized.

## Direct answers

- PENDING access in feed? No.
- Private posts from followed users? Yes, only if GRANTED.
- Following vs followers priority? Following > followers.
- Apply priority to all pages? Yes; at least self + following persist beyond page 1.

## Rationale

Jobs should not be required for a user to see their own post. If a user cannot
see their own post immediately, the feed is broken.

Presort is an optimization layer. Relationship content (self + following) is
foundational and must not be delayed by TTLs or background jobs.

## Implementation checklist (code touchpoints)

### Feed request pipeline

- [ ] Add tiered merging in `backend/src/registry/domains/feed/index.ts` (self, following, followers, everyone) and enforce hard tier order on every request.
- [ ] Extend tier types in `backend/src/registry/domains/feed/types.ts` to carry tier metadata for ranking/debug.
- [ ] Add relationship lookup helper using `profileAccess` (GRANTED only) in a new service (example: `backend/src/services/feed/relationshipService.ts`).

### Candidate selection and visibility

- [ ] Add tiered post queries (self, following, followers) with visibility rules in `backend/src/registry/domains/feed/candidates/posts.ts`.
- [ ] Keep global candidates for EVERYONE in `backend/src/registry/domains/feed/candidates/posts.ts` (PUBLIC only).
- [ ] Update caps and per-tier limits in `backend/src/registry/domains/feed/config.ts`.

### Scoring and ranking

- [ ] Apply scoring inside a tier only in `backend/src/registry/domains/feed/scoring/index.ts`.
- [ ] Update `backend/src/registry/domains/feed/ranking/index.ts` to consume tiered groups (concatenate by tier, then sequence/slots inside each tier).

### Presort path changes

- [ ] Respect cursoring for presort in `backend/src/registry/domains/feed/index.ts` (map cursor to segment or bypass presort when `cursorId` is present).
- [ ] Ensure seen penalties and `recordFeedSeen` run on presort path in `backend/src/registry/domains/feed/index.ts` and `backend/src/services/feed/presortedFeedHelpers.ts`.
- [ ] If presort only fills EVERYONE, add tier metadata to presorted items in `backend/src/services/feed/presortedFeedService.ts` and `backend/src/jobs/feedPresortJob.ts`.

### Invalidation and freshness

- [ ] On post create, invalidate presorted segments for the author and followers in `backend/src/registry/domains/feed/index.ts` (use `backend/src/services/feed/presortedFeedService.ts`).
- [ ] On access grant/deny, invalidate presorted segments for viewer/owner in `backend/src/registry/domains/profiles/index.ts`.
- [ ] Add revoke/unfollow endpoint (or explicit REVOKED flow) and invalidate in `backend/src/registry/domains/profiles/index.ts` and `backend/src/lib/openapi/emitOpenApi.ts`.
- [ ] Bust frontend feed cache after post creation in `frontend/src/core/feed/useRiverFeedPhased.ts` or from the post create flow in `frontend/src/api/client.ts`.

### API alignment and docs

- [ ] Standardize on `take` in `frontend/src/api/client.ts` and `backend/src/registry/domains/feed/context.ts`.
- [ ] Use `nextCursorId` consistently in `frontend/src/api/adapters.ts`.
- [ ] Update `docs/FEED_LOADING_FLOW.md` and `docs/feed-jobs-system.md` after implementation.

### Tests

- [ ] Add tier ordering tests in `backend/src/registry/domains/feed/__tests__/feed.test.ts` (self > following > followers > everyone).
- [ ] Add visibility tests for PRIVATE posts with GRANTED access in `backend/src/registry/domains/feed/__tests__/feed.test.ts`.
- [ ] Add presort pagination and seen-penalty tests in `backend/src/registry/domains/feed/__tests__/feed.test.ts`.
