# Feed Comments, Stats, and Questions - Schema Proposal

## Roadmap
1) Confirm schema invariants and cardinality rules (comments, stats ownership, questions).
2) Add new Prisma schema files for comments, engagement stats, and feed questions.
3) Generate a migration and update seeds with minimal, representative data.
4) Implement write-path counters with idempotency guarantees.
5) Add reconciliation jobs and backfill stats for existing data.

## Goals
- Keep the schema minimal but future-proof.
- Preserve referential integrity where possible.
- Support fast counts (commentCount, likeCount, ratingCount) without heavy queries.
- Provide enough structure to render comment previews and question cards.

## Proposed schemas

### 1) Comments
We need a durable, queryable comment model with optional threading and soft deletion. Because the frontend comment API is polymorphic (`cardKind` + `cardId`), the schema should allow comments on multiple target kinds (post, profile, question, etc.).

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
  body        String        @db.Text
  status      CommentStatus @default(ACTIVE)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  deletedAt   DateTime?

  // Optional threading
  parentId    BigInt?
  rootId      BigInt?

  author      User          @relation(fields: [authorId], references: [id])

  @@index([targetKind, targetId, createdAt])
  @@index([targetKind, targetId, rootId, createdAt])
  @@index([authorId, createdAt])
  @@index([parentId])
  @@index([rootId])
}
```

Notes:
- `targetKind + targetId` keeps comments flexible without polymorphic Prisma relations.
- `status` + `deletedAt` supports moderation and soft deletion.
- `parentId/rootId` allow threads but can be unused initially.
- Threading invariant (enforce in write path):
  - top-level: `parentId = null`, `rootId = id`
  - reply: `parentId != null`, `rootId = ancestor.id`
- Comment previews can be built from the most recent N comments per target, with the `targetKind/targetId/rootId/createdAt` index.

Not in v1: CommentThread (defer until unread tracking, per-thread intent, or moderation summaries are needed).

### 2) Stats (engagement + ratings)
Stats should be denormalized so feed rendering does not need heavy aggregates. We can keep post stats separate from profile rating stats to preserve integrity.

Rule (ownership):
- Write path increments counters.
- Jobs only reconcile/repair.
- Never recompute counts during feed reads.

```prisma
model PostStats {
  id            BigInt   @id @default(autoincrement())
  postId        BigInt   @unique
  likeCount     Int      @default(0)
  commentCount  Int      @default(0)
  lastLikeAt    DateTime?
  lastCommentAt DateTime?
  updatedAt     DateTime @updatedAt

  post          Post     @relation(fields: [postId], references: [id])
}
```

```prisma
model ProfileStats {
  id               BigInt   @id @default(autoincrement())
  profileId        BigInt   @unique
  likeCount        Int      @default(0)
  dislikeCount     Int      @default(0)
  ratingCount      Int      @default(0)
  ratingSumAttractive Int   @default(0)
  ratingSumSmart      Int   @default(0)
  ratingSumFunny      Int   @default(0)
  ratingSumInteresting Int  @default(0)
  updatedAt        DateTime @updatedAt

  profile          Profile  @relation(fields: [profileId], references: [id])
}
```

Notes:
- `PostStats.commentCount` ties directly to comments on posts.
- `ProfileStats` supports the `ratingAverage` and `ratingCount` fields without recomputing.
- `likeCount/dislikeCount` maps to the `Like` model (user-to-user actions).
- Idempotency protection is required to keep counters correct under retries:
  - unique `(userId, postId, actionKind)` for post likes/reactions
  - unique `(userId, profileId)` for ratings

If traits may change over time, prefer a JSON sum map instead of fixed columns:

```prisma
model ProfileStats {
  id               BigInt   @id @default(autoincrement())
  profileId        BigInt   @unique
  likeCount        Int      @default(0)
  dislikeCount     Int      @default(0)
  ratingCount      Int      @default(0)
  ratingSums       Json     @default("{}") // { attractive: 123, smart: 456 }
  updatedAt        DateTime @updatedAt

  profile          Profile  @relation(fields: [profileId], references: [id])
}
```

### 3) Questions
We already have quiz schema (`Quiz`, `QuizQuestion`, `QuizOption`). We only need a mapping to feed cards.

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
```

Notes:
- The feed can populate `question` from `QuizQuestion` + `QuizOption`.
- If we want to associate a question directly with a post, set `targetKind = POST` and `targetId = postId`.
- Allow multiple questions over time, but only one active per target.

## Decisions
- Comments: keep polymorphic schema, enforce post-only in service layer for now.
- Comment reactions: defer (reserve model shape only).
- CommentThread: not in v1.
- FeedQuestion: allow many historical, one active at a time.

## Reserved for later (no implementation in v1)
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
