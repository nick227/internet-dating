# Feed Comments, Stats, Questions - Implementation Plan (Internet Dating)

This document turns `docs/proposal.md` into concrete, repo-specific implementation steps.

## Scope and decisions
- Comments are polymorphic at the schema level but enforced as post-only in service code for now.
- CommentThread table is deferred.
- Comment reactions are deferred; reserve schema shape only.
- FeedQuestion may keep history; enforce one active per target with a DB-level guarantee.
- Stats counters are owned by write paths; jobs only reconcile/repair.
- Idempotency is required for likes and ratings to avoid counter drift.

## Roadmap
1) Confirm schema invariants and cardinality rules (comments, stats ownership, questions).
2) Add Prisma schema + migrations + backfill script + reconciliation job skeleton.
3) Implement comment create + preview (post-only).
4) Implement stateful reactions (post/profile) + stats write-path updates.
5) Implement FeedQuestion assignment flow (Option A or B).
6) Update feed hydration contract to include stats/comments/question fields.

## Files to add or modify
Prisma schema files (folder-based Prisma):
- `backend/prisma/schema/comments.prisma` (new)
- `backend/prisma/schema/stats.prisma` (new)
- `backend/prisma/schema/questions.prisma` (new)
- `backend/prisma/schema/content.prisma` (replace or extend `LikedPost` for stateful reactions)
- `backend/prisma/schema/matching.prisma` (extend `Like` for stateful profile reactions)
- `backend/prisma/schema/ratings.prisma` (ensure uniqueness already enforced)

Backend service layers (to be implemented after schema):
- `backend/src/.../comments` (new handlers + validators)
- `backend/src/.../feed` (hydrate comments preview, stats, question)
- `backend/src/.../jobs` (reconciliation jobs for stats)

Frontend adjustments (post schema only, later step):
- `frontend/src/api/contracts.ts` / OpenAPI schema (add fields)
- `frontend/src/api/types.ts` (regenerate)

## 1) Prisma schema changes

Create `backend/prisma/schema/comments.prisma`:

```prisma
enum CommentTargetKind {
  POST
  PROFILE
  QUESTION
  MATCH
}

enum CommentStatus {
  ACTIVE
  HIDDEN
  DELETED
}

model Comment {
  id          BigInt        @id @default(autoincrement())
  targetKind  CommentTargetKind
  targetId    BigInt
  authorId    BigInt
  clientRequestId String?
  body        String        @db.Text
  status      CommentStatus @default(ACTIVE)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  deletedAt   DateTime?

  parentId    BigInt?
  rootId      BigInt?

  author      User          @relation(fields: [authorId], references: [id])

  @@unique([authorId, targetKind, targetId, clientRequestId])
  @@index([targetKind, targetId, createdAt])
  @@index([targetKind, targetId, rootId, createdAt])
  @@index([authorId, createdAt])
  @@index([parentId])
  @@index([rootId])
}
```

Create `backend/prisma/schema/stats.prisma`:

```prisma
model PostStats {
  id            BigInt   @id @default(autoincrement())
  postId        BigInt   @unique
  likeCount     Int      @default(0)
  commentCount  Int      @default(0)
  lastLikeAt    DateTime?
  lastCommentAt DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  post          Post     @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@index([updatedAt])
}

// If traits are frozen, keep fixed columns; otherwise use ratingSums Json.
model ProfileStats {
  id               BigInt   @id @default(autoincrement())
  profileId        BigInt   @unique
  likeCount        Int      @default(0)
  dislikeCount     Int      @default(0)
  ratingCount      Int      @default(0)
  ratingSums       Json?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  profile          Profile  @relation(fields: [profileId], references: [id])

  @@index([updatedAt])
}
```

Create `backend/prisma/schema/questions.prisma`:

```prisma
enum QuestionTargetKind {
  POST
  PROFILE
  FEED
}

model FeedQuestion {
  id             BigInt   @id @default(autoincrement())
  targetKind     QuestionTargetKind
  targetId       BigInt
  quizId         BigInt
  quizQuestionId BigInt
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  quiz           Quiz         @relation(fields: [quizId], references: [id])
  question       QuizQuestion @relation(fields: [quizQuestionId], references: [id])

  @@index([targetKind, targetId, isActive])
  @@index([quizId])
}

// If you want a DB-level guarantee for "one active per target" while keeping history,
// add a current pointer table:
//
// model FeedQuestionCurrent {
//   id             BigInt   @id @default(autoincrement())
//   targetKind     QuestionTargetKind
//   targetId       BigInt
//   feedQuestionId BigInt
//   updatedAt      DateTime @updatedAt
//
//   @@unique([targetKind, targetId])
//   @@index([feedQuestionId])
// }
```

Optional (reserve only, do not implement yet):

```prisma
enum ReactionKind {
  LIKE
  DISLIKE
}

model CommentReaction {
  id        BigInt @id @default(autoincrement())
  commentId BigInt
  userId    BigInt
  kind      ReactionKind
  createdAt DateTime @default(now())

  @@unique([commentId, userId, kind])
  @@index([commentId, createdAt])
}
```

Idempotency constraints:
- For post likes: one row per user+post with a state field (toggle updates, not inserts).
- For profile likes/dislikes: one row per user+target with a state field (toggle updates, not inserts).
- For profile ratings: already enforced by `ProfileRating @@unique([raterProfileId, targetProfileId])`.

JSON defaults (MySQL + Prisma):
- JSON defaults can be finicky; safest is `ratingSums` nullable and set `{}` in code on create/upsert.
- If you keep a JSON default, verify the generated SQL from `prisma migrate dev`.
- Standardize the shape (example): `{ attractive: 0, smart: 0, funny: 0, interesting: 0 }`.

Recommended reaction schema (stateful, idempotent):

```prisma
enum ReactionKind {
  LIKE
  DISLIKE
}

model PostReaction {
  id        BigInt   @id @default(autoincrement())
  postId    BigInt
  userId    BigInt
  kind      ReactionKind
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  post      Post   @relation(fields: [postId], references: [id], onDelete: Cascade)
  user      User   @relation(fields: [userId], references: [id])

  @@unique([postId, userId, kind])
  @@index([userId, postId])
  @@index([postId, active, updatedAt])
}

model ProfileReaction {
  id        BigInt   @id @default(autoincrement())
  fromUserId BigInt
  toUserId   BigInt
  kind      ReactionKind
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  fromUser  User @relation("ProfileReactionsMade", fields: [fromUserId], references: [id])
  toUser    User @relation("ProfileReactionsGot", fields: [toUserId], references: [id])

  @@unique([fromUserId, toUserId, kind])
  @@index([toUserId, active, updatedAt])
}
```

Run migrations after schema changes:
```
cd backend
npx prisma migrate dev --schema prisma/schema --name comments_stats_questions
```

Production/CI:
```
cd backend
npx prisma migrate deploy --schema prisma/schema
```

Note: avoid `prisma db push` for durable environments; it is only for throwaway prototypes.

## 2) Write-path rules (non-negotiable)
Enforce the invariants in service code:

Comments:
- Top-level: `parentId = null`, `rootId = null`.
- Reply: `parentId != null`, `rootId = ancestor.id`.

Stats:
- Write path increments counters and updates timestamps.
- Jobs only reconcile and repair.
- Never compute counts during feed reads.

FeedQuestion:
- If keeping history, allow multiple records per target.
- Exactly one active per target at any time (DB-enforced).

## 3) Service layer implementation checklist
Comments:
- Create comment (post-only for now; reject other target kinds).
- Require `clientRequestId` in the API layer (nullable in schema for seeds/backfill).
- Threading invariant (Option 2):
  - Top-level: `parentId = null`, `rootId = null`.
  - For replies: set `parentId` and `rootId = topLevelId` on insert.
- On create: upsert `PostStats`, increment `commentCount`, set `lastCommentAt`.
- On delete/hide: only decrement on ACTIVE -> non-active transitions. Use ACTIVE as the only counted status.

Stats:
- On post like/unlike: update `PostStats.likeCount` and `lastLikeAt`.
- On profile like/dislike: update `ProfileStats.likeCount`/`dislikeCount`.
- On profile rating: update `ProfileStats.ratingCount` and `ratingSums`.
- Always upsert stats rows on first touch before increment/decrement.
- Only increment/decrement when reaction state changes (active true/false).

Questions:
- MySQL race protection: choose a DB-level strategy.
  - Option A (simplest): enforce one row per target.
    - Use `@@unique([targetKind, targetId])` and treat the row as current assignment.
    - Store history later if needed.
  - Option B (keep history now): introduce `FeedQuestionCurrent` with `@@unique([targetKind, targetId])` and keep `FeedQuestion` as history.
- On assignment, update the current pointer in the same transaction (Option B), or update the single row (Option A).

## 4) Feed hydration (later step)
Add `stats`, `comments.preview`, and `question` to the feed response:
- `stats` from PostStats/ProfileStats (already denormalized).
- `comments.preview` from most recent N ACTIVE comments for the target.
- `question` from active FeedQuestion joined to QuizQuestion + QuizOption.

## 5) Jobs (reconcile only)
Create periodic jobs to:
- Recompute `PostStats.likeCount` and `commentCount` from source tables.
- Recompute `ProfileStats` counts and rating sums from source tables.
- Fix mismatches by setting counters to authoritative aggregates (not diffs).
- Use bounded windows (only recompute touched targets since last run).
- Log: `targetKind`, `targetId`, expected, actual, appliedAt.

## 6) Backfill
One-time script:
- Initialize `PostStats` and `ProfileStats` rows.
- Backfill counts and rating sums.
- Verify results with sanity checks (sample posts/profiles).

## 7) Tests and validation
Unit tests:
- Comment threading invariants.
- Idempotent writes (double-submit).
- Stats counters update correctly.
- Only one active FeedQuestion per target.

Data checks:
- Compare stats tables vs. raw aggregates on a small dataset.

## Additional schema notes
Comments:
- Indexing: current indexes are fine, but if v1 preview needs "latest N top-level comments",
  either filter by `parentId = null` in code (small N) or add `isRoot Boolean @default(false)`
  to support an index-friendly query.
- Consider adding `editedAt DateTime?` for auditability.
- Keep status naming consistent across the system (status vs. visibility).
- BigInt ids: API responses should serialize as strings to avoid frontend BigInt issues.
- Avoid cascading deletes on `Comment.author`; prefer user soft deletes.

PostStats/ProfileStats:
- Add `createdAt DateTime @default(now())` to both stats tables.
- Set `onDelete: Cascade` on `PostStats.post` to avoid orphan rows.
- Decide profile delete strategy (soft delete preferred; otherwise cascade or cleanup job).

FeedQuestion:
- If you keep historical rows, implement the transaction + DB constraint strategy above to avoid double-active rows.

## Write-path rules checklist (explicit)
- All counter updates happen in the same DB transaction as the source write.
- Post likes: one row per user+post with a state field (toggle updates, not inserts).
- Comment create flow:
  - Insert comment
  - Upsert stats row + increment
- Comment delete/hide flow:
  - Update comment status
  - If ACTIVE -> non-active, decrement stats
  - `lastCommentAt`: best-effort on writes, or query latest ACTIVE comment on delete
- Use atomic increments/decrements (Prisma `increment`/`decrement`) instead of read-modify-write.

## Open items to confirm
- If ratings traits are frozen, we can switch back to fixed columns.
- JSON default strategy for `ratingSums` (nullable + set in code vs. DB default).
- Whether to allow comments on profile cards in the next release window.
- FeedQuestion strategy: Option A (single row) vs Option B (current pointer table).
