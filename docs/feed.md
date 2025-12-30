# Feed System Architecture & Control

## Overview

The feed system is a modular pipeline that aggregates **posts** and **profile suggestions** into a personalized, paginated stream. It's designed with clear separation between data gathering, scoring, ranking, and hydration.

---

## End-to-End User Post Flow

### 1. Post Creation (`POST /posts`)

**Location**: `backend/src/registry/domains/feed/index.ts` (lines 37-89)

**Flow**:
1. User submits post via `PostContentModal` with:
   - `text` (optional string)
   - `visibility` (`PUBLIC` | `PRIVATE`, defaults to `PUBLIC`)
   - `mediaIds` (array of uploaded media IDs)

2. **Media Validation**:
   - Validates all `mediaIds` are owned by the user
   - For `PUBLIC` posts: requires media to be `PUBLIC` and `READY`
   - For `PRIVATE` posts: media can be any visibility but must be `READY`
   - Type constraint: currently only `IMAGE` type allowed

3. **Post Creation**:
   ```typescript
   await prisma.post.create({
     data: {
       userId,
       visibility: vis,  // PUBLIC or PRIVATE
       text: text ?? null,
       media: parsedMediaIds.length ? {
         create: parsedMediaIds.map((id, idx) => ({
           order: idx,
           mediaId: id
         }))
       } : undefined
     }
   })
   ```

4. **Response**: Returns `{ id, createdAt }` (201 Created)

### 2. Optimistic Feed Insert (Frontend)

**Location**: `frontend/src/ui/shell/PostContentModal.tsx` (lines 319-351)

**Flow**:
1. After media uploads complete (but before API call):
   - Creates optimistic `FeedCard` with preview URLs
   - Only for `PUBLIC` posts
   - Dispatches `feed:optimistic-insert` event

2. Feed hook (`useRiverFeed`) listens and:
   - Inserts card at top of feed
   - Scrolls to top to show new post
   - Shows "Posting..." badge on optimistic post

3. After successful API call:
   - Dispatches `feed:refresh` event
   - Removes optimistic post
   - Refreshes feed from start to get real post

4. On error:
   - Dispatches `feed:remove-optimistic` event
   - Shows alert with error message
   - Removes optimistic post

### 3. Feed Inclusion

**Key Point**: Posts appear in feed **only if**:
- `visibility === 'PUBLIC'`
- `deletedAt IS NULL`
- User's `deletedAt IS NULL`

**Location**: `backend/src/registry/domains/feed/candidates/posts.ts` (line 6)

```typescript
where: { 
  deletedAt: null, 
  visibility: 'PUBLIC', 
  user: { deletedAt: null } 
}
```

**Ordering**: `createdAt DESC, id DESC` (newest first)

**Pagination**: Cursor-based using post `id` (BigInt)

---

## Feed API Architecture

### Pipeline Stages

The feed generation follows a 5-stage pipeline:

```
Request → Context → Candidates → Scoring → Ranking → Hydration → Response
```

#### Stage 1: Context Builder

**Location**: `backend/src/registry/domains/feed/context.ts`

**Purpose**: Parse request parameters and build viewer context

**Input**:
- Query params: `take` (default: 20, max: 50), `cursorId` (optional BigInt)
- Request context: `userId` (from auth, can be null for anonymous)

**Output**: `ViewerContext`
```typescript
{
  userId: bigint | null,  // null for anonymous users
  take: number,           // 20-50
  cursorId: bigint | null // for pagination
}
```

**Control Points**:
- `take`: Controls page size (20-50 items)
- `cursorId`: Cursor-based pagination (post ID)

#### Stage 2: Candidate Gathering

**Location**: `backend/src/registry/domains/feed/candidates/index.ts`

**Purpose**: Fetch raw candidates from all sources in parallel

**Sources**:
1. **Posts** (`candidates/posts.ts`):
   - Fetches PUBLIC posts ordered by `createdAt DESC, id DESC`
   - Applies a lookback window (last N days) and candidate cap (max 500)
   - Uses cursor pagination for page boundary only
   - Returns `FeedPostCandidate[]` with `nextCursorId` (based on page size)

2. **Profile Suggestions** (`candidates/profiles.ts`):
   - Only for authenticated users (`ctx.userId` required)
   - Two tiers:
     - **Matches**: Active matches (up to 3, ordered by `updatedAt DESC`)
     - **Scored Suggestions**: From `MatchScore` table (ordered by `score DESC`, up to 200)
     - **Fallback**: Random visible profiles if no scores exist
   - Filters: `isVisible`, `deletedAt`, blocks (bidirectional)
   - Returns `FeedSuggestionCandidate[]`

**Output**: `FeedCandidateResult`
```typescript
{
  posts: FeedPostCandidate[],
  suggestions: FeedSuggestionCandidate[],
  nextCursorId: bigint | null  // from posts pagination
}
```

**Control Points**:
- **Posts**: Candidate pool uses lookback + cap, pagination controlled by `cursorId` and `take`
- **Suggestions**: 
  - Match limit: `3`
  - Candidate limit: `200`
  - Requires `userId` (no suggestions for anonymous)

#### Stage 3: Scoring

**Location**: `backend/src/registry/domains/feed/scoring/index.ts`

**Current State**: **Active** (dedupe + seen demotion + scoring)
```typescript
finalScore =
  w_recency * postRecency +
  w_affinity * affinityScore +
  w_quality * contentQuality -
  w_seen * seenPenalty
```

**Behavior**:
- Dedupe within posts, within suggestions, and across sources (actor overlap)
- Posts score via recency + seen penalty
- Suggestions score via MatchScore + seen penalty
- Seen demotion is soft (binary for now)

**Control Points**:
- Weights are defined in scoring (`SCORE_WEIGHTS`)
- Seen window hours from `feedConfig`

#### Stage 4: Ranking & Merging

**Location**: `backend/src/registry/domains/feed/ranking/index.ts`

**Current State**: **Active** (interleaving + diversity)

**Config** (`config.ts`):
```typescript
{
  maxConsecutiveSource: 3,
  maxPerSource: {
    posts: 20,        // legacy (page size uses `take`)
    suggestions: 10
  },
  maxPerActor: 3,
  seenWindowHours: 24
}
```

**Behavior**:
- Interleaves posts and suggestions with diversity constraints
- Enforces `maxConsecutiveSource` and `maxPerActor`
- Suggestions are ordered by score; `seed` provides deterministic tie-break
- Final caps: posts limited by `take`, suggestions by `maxPerSource.suggestions`

**Control Points**: Config values are enforced; page size is controlled by `take`

#### Stage 5: Hydration

**Location**: `backend/src/registry/domains/feed/hydration/index.ts`

**Purpose**: Enrich candidates with stats and media

**Process**:
1. **Stats Building** (`hydration/stats.ts`):
   - Aggregates rating stats for all users in feed
   - Computes average ratings (attractive, smart, funny, interesting)
   - Fetches viewer's personal ratings (if authenticated)
   - Returns `Map<userId, FeedStats>`

2. **Suggestion Media** (`hydration/media.ts`):
   - Fetches up to 6 most recent PUBLIC media per suggested user
   - Uses raw SQL with `ROW_NUMBER()` for efficient ranking
   - Filters: `deletedAt IS NULL`, `visibility = 'PUBLIC'`, `status = 'READY'`
   - Returns `Map<userId, Media[]>`

3. **Post Media**: Already included in candidate fetch (no additional hydration needed)

**Output**: `HydratedFeedItems`
```typescript
{
  posts: HydratedPost[],      // Posts with stats attached
  suggestions: HydratedSuggestion[]  // Suggestions with media + stats
}
```

**Control Points**:
- `SUGGESTION_MEDIA_LIMIT = 6` (hardcoded in `hydration/media.ts`)

### Final Response

**Location**: `backend/src/registry/domains/feed/index.ts` (line 33)

**Response Shape**:
```typescript
{
  posts: HydratedPost[],
  suggestions: HydratedSuggestion[],
  nextCursorId: string | null  // String representation of BigInt
}
```

**Frontend Adaptation**: `frontend/src/api/adapters.ts` (lines 49-112)
- Converts backend response to `FeedCard[]`
- Interleaves posts and suggestions (currently just concatenates)
- Adds presentation hints (mosaic mode, accents)
- Maps to unified `FeedCard` type

---

## Control Mechanisms

### 1. Pagination

**Query Parameters**:
- `take`: Number of items (20-50, default: 20)
- `cursorId`: Post ID for cursor-based pagination (BigInt as string)

**How It Works**:
- First request: `GET /feed?take=20` (no cursor)
- Next request: `GET /feed?take=20&cursorId=<lastPostId>`
- Cursor is the `id` of the last post in the previous page
- `nextCursorId` is `null` when no more pages

**Limitation**: Pagination only works for posts. Suggestions are always fresh (no pagination).

### 2. Visibility Control

**Post Visibility**:
- `PUBLIC`: Visible to all users in feed
- `PRIVATE`: Only visible on user's profile (never in feed)

**Media Visibility**:
- For `PUBLIC` posts: Media must be `PUBLIC` and `READY`
- For `PRIVATE` posts: Media can be any visibility but must be `READY`

**User Visibility**:
- Posts from deleted users (`deletedAt IS NOT NULL`) are excluded
- Posts with `deletedAt IS NOT NULL` are excluded

### 3. Blocking & Safety

**Profile Suggestions**:
- Excludes users who blocked the viewer
- Excludes users blocked by the viewer
- Only shows `isVisible: true` profiles

**Posts**:
- No explicit blocking filter on posts (yet)
- Relies on user deletion (`deletedAt`)

### 4. Authentication Impact

**Anonymous Users** (`userId === null`):
- ✅ Can see PUBLIC posts
- ❌ No profile suggestions
- ❌ No personal stats (ratings)

**Authenticated Users**:
- ✅ Can see PUBLIC posts
- ✅ Get profile suggestions (matches + scored)
- ✅ Get personal ratings in stats
- ✅ Can create posts

### 5. Feed Configuration

**Location**: `backend/src/registry/domains/feed/config.ts`

**Current Config**:
```typescript
{
  maxConsecutiveSource: 3,
  maxPerSource: {
    posts: 20,        // legacy (page size uses `take`)
    suggestions: 10
  },
  maxPerActor: 3,
  seenWindowHours: 24
}
```

**Enforcement Status**:
- `maxPerSource.posts`: page size controlled by `take`
- `maxPerSource.suggestions`: enforced in ranking
- `maxConsecutiveSource`: enforced in ranking
- `maxPerActor`: enforced in ranking
- `seenWindowHours`: enforced in scoring

---

## Current Limitations & Gaps

### 1. Minimal Personalization
- Scoring exists (recency + seen demotion), but no affinity/quality/trending yet
- Ranking interleaves posts and suggestions with diversity constraints
- Suggestions rely on MatchScore; posts are still mostly recency-driven

### 2. Limited Post Filtering
- Posts are recency-weighted but still primarily chronological
- No filtering by user, tags, interests, location
- No "hide" or "mute" functionality

### 3. Limited Suggestion Control
- Suggestions are matches + MatchScore + fallback profiles
- No manual curation or curated pools yet
- No explicit "exclude user" control beyond blocks

### 4. Pagination Gaps
- Only posts are paginated (suggestions are always fresh)
- No way to paginate suggestions separately
- Cursor is post-only (can't mix post/suggestion pagination)

### 5. No Real-time Updates
- Feed is static until next request
- No WebSocket updates for new posts
- Optimistic inserts are frontend-only

### 6. Stats Limitations
- Stats only include ratings (no like/comment counts on posts)
- No engagement metrics (views, shares)
- No trending/popularity signals

---

## How to Control the Feed

### For Developers

#### 1. Adjust Page Size
```typescript
// In context.ts, change defaults:
const takeParsed = parseLimit(req.query.take, 20, 50);  // default: 20, max: 50
```

#### 2. Change Suggestion Limits
```typescript
// In config.ts:
export const feedConfig = {
  maxPerSource: {
    suggestions: 10  // Change this
  }
}
```

#### 3. Modify Post Query
```typescript
// In candidates/posts.ts, modify where clause:
where: { 
  deletedAt: null, 
  visibility: 'PUBLIC', 
  user: { deletedAt: null } 
  // Add filters here: location, tags, etc.
}
```

#### 4. Implement Scoring
```typescript
// In scoring/index.ts, add scoring logic:
export function scoreCandidates(ctx: ViewerContext, candidates: FeedCandidateSet): FeedCandidateSet {
  // Add affinity scores, recency weighting, etc.
  return scoredCandidates;
}
```

#### 5. Implement Ranking
```typescript
// In ranking/index.ts, add interleaving logic:
export function mergeAndRank(ctx: ViewerContext, candidates: FeedCandidateSet): FeedCandidateSet {
  // Interleave posts and suggestions
  // Enforce maxConsecutiveSource, maxPerActor
  return rankedCandidates;
}
```

### For Users (Current)

**Limited Control**:
- ✅ Can create PUBLIC or PRIVATE posts
- ✅ Can delete own posts
- ✅ Can update post text/visibility
- ❌ Cannot filter feed
- ❌ Cannot hide specific posts/users
- ❌ Cannot customize suggestion preferences

---

## Future Enhancements (From Original Plan)

### 1. Personalization Pipeline
- **Affinity Scoring**: Based on quiz answers, shared interests, interaction history
- **Recency Weighting**: Boost recent posts while maintaining diversity
- **Intent Matching**: Weight suggestions by dating intent alignment

### 2. Advanced Ranking
- **Interleaving**: Mix posts and suggestions with diversity constraints
- **Actor Limits**: Prevent single user from dominating feed
- **Source Limits**: Prevent consecutive items from same source

### 3. User Preferences
- **Feed Filters**: Hide posts by user, tags, location
- **Suggestion Preferences**: Adjust suggestion frequency, types
- **Content Preferences**: Prefer video vs image, text-heavy vs media-heavy

### 4. Real-time Updates
- **WebSocket Feed**: Push new posts to active viewers
- **Live Stats**: Update like/comment counts in real-time
- **Presence**: Show when users are online/active

### 5. Engagement Metrics
- **Like/Comment Counts**: Track and display on posts
- **View Tracking**: Record and use view counts for ranking
- **Trending Algorithm**: Identify and boost trending content

---

## API Reference

### `GET /feed`

**Query Parameters**:
- `take` (optional, number): Page size (20-50, default: 20)
- `cursorId` (optional, string): Post ID for pagination (BigInt as string)

**Response**:
```typescript
{
  posts: Array<{
    id: string,
    text: string | null,
    createdAt: string,
    user: { id: string, profile: { displayName: string | null } | null },
    media: Array<{ order: number, media: MediaObject }>,
    stats: { ratingAverage?: number, ratingCount?: number, myRating?: RatingScores | null } | null
  }>,
  suggestions: Array<{
    userId: string,
    displayName: string | null,
    bio: string | null,
    locationText: string | null,
    intent: string | null,
    source: 'match' | 'suggested',
    media: MediaObject[],
    stats: { ratingAverage?: number, ratingCount?: number, myRating?: RatingScores | null } | null
  }>,
  nextCursorId: string | null
}
```

**Auth**: Public (works for anonymous users, but suggestions require auth)

### `POST /posts`

**Body**:
```typescript
{
  text?: string | null,
  visibility?: 'PUBLIC' | 'PRIVATE',  // defaults to 'PUBLIC'
  mediaIds?: Array<string | number>
}
```

**Response**: `{ id: string, createdAt: string }` (201 Created)

**Auth**: Required (user must be authenticated)

**Validation**:
- Requires `text` OR `mediaIds` (at least one)
- All `mediaIds` must be owned by user
- For `PUBLIC` posts: media must be `PUBLIC` and `READY`
- For `PRIVATE` posts: media must be `READY` (any visibility)

---

## Summary

The feed system is a **modular pipeline** with clear separation of concerns:

1. **Context**: Parses request parameters
2. **Candidates**: Fetches raw data (posts + suggestions)
3. **Scoring**: Dedupe + recency + seen demotion
4. **Ranking**: Interleaving & diversity (active)
5. **Hydration**: Enriches with stats and media

**Current State**: Recency-weighted posts + MatchScore-driven suggestions with dedupe, seen demotion, and diversity caps.

**Control Points**:
- Pagination: `take`, `cursorId`
- Visibility: Post and media visibility flags
- Limits: Config values for suggestions/posts
- Blocks: Automatic filtering in suggestions

**Next Steps**: Add affinity/quality/trending signals and expand job-driven personalization.
