# internet-dating.com 

Production-minded dating app POC with a sequence-first feed, match system, and job-driven personalization.

## App Functionality & Features

### Core Pages

**Feed (`/feed`)**
- Personalized sequence-driven feed mixing posts, profile suggestions, and quiz questions
- Posts from other users with images, text, and engagement metrics
- Profile suggestions based on match scores, compatibility, and preferences
- Interactive quiz questions embedded in feed flow
- Infinite scroll with cursor-based pagination
- Real-time updates via WebSocket connections

**Profile Pages (`/profiles/:userId`)**
- Hero section with customizable media mosaic (up to 7 slots for images/videos)
- User information: display name, bio, location, dating intent
- Public posts gallery with media and text content
- Profile actions: like/dislike, follow/unfollow, rate (attractive, smart, funny, interesting, fit)
- Profile access system: request/grant/deny private profile access
- Inline editing for profile owners (name, bio, media management)
- Post composer for creating new content
- View followers and following lists

**Connections (`/connections`)**
- **Matches** (`/connections/matches`): View all mutual matches with compatibility scores
- **Inbox** (`/connections/inbox`): Conversation list with unread indicators
- **Followers** (`/connections/followers`): Users following you
- **Following** (`/connections/following`): Users you follow
- Individual conversation view with real-time messaging
- Message receipts and read status indicators

**Personality Portal (`/personality`)**
- **Quizzes** (`/personality/quizzes`): Browse and take personality quizzes
- **Quiz Detail** (`/personality/quizzes/:quizId`): View quiz details and questions
- **Quiz Results** (`/quiz/:quizId/results`): View personalized quiz results and trait analysis
- **Interests** (`/personality/interests`): Manage user interests and preferences
- Quiz system builds user traits for matching and compatibility

**Profile Search (`/profiles/search`)**
- Advanced search with filters: location, age, gender, dating intent, interests
- Sort by match score, ratings, proximity, or recency
- Proximity-based search with distance calculations
- Search results with compatibility previews

**Authentication (`/login`)**
- Email/password authentication
- Session management with protected routes
- Automatic redirect for authenticated users

### Key Features

**Matching System**
- Like/dislike profiles to express interest
- Mutual likes automatically create matches and conversations
- Match scores computed via background jobs for personalized suggestions
- Compatibility scores calculated from quiz results, interests, and ratings

**Content Creation**
- Create posts with text and multiple media attachments (images, videos)
- Public or private post visibility
- Media upload with processing pipeline (validation, variants, thumbnails)
- Optimistic UI updates for instant feedback

**Real-time Communication**
- WebSocket-based messaging system
- Presence indicators (online/offline status)
- Real-time message delivery and read receipts
- Conversation state synchronization

**Personalization**
- Background jobs precompute match scores, compatibility, trending content, and affinity profiles
- Feed sequence configurable (e.g., 3 posts → 1 suggestion → 1 quiz)
- Presorted feed segments for faster load times
- User traits derived from quiz answers for better matching

**Social Features**
- Follow/unfollow system
- Profile ratings across multiple dimensions
- Comment system on posts
- Like posts and comments
- User blocking and reporting

**Media Management**
- Upload and manage images, videos, and audio
- Media processing with status tracking (uploading, validating, ready, etc.)
- Profile hero mosaic with drag-and-drop media arrangement
- Media viewer with full-screen support

## Repository Structure
- `backend/` Express + Prisma API, jobs, and seeds.
- `frontend/` Vite + React UI.
- `shared/` Shared types/contracts.
- `docs/` Product + architecture notes.

## Feed System (Sequence-First)
The feed is server-ordered and sequence-driven. The sequence defines the repeating pattern, and caps are guardrails only.

Core flow (runtime):
1) `buildViewerContext` -> read query + auth
2) `getCandidates` -> posts + suggestions + questions
3) `scoreCandidates` -> recency + affinity placeholder + seen demotion
4) `mergeAndRank` -> applies sequence pattern
5) `hydrateFeedItems` -> media/stats/compatibility

Config entry point:
- `backend/src/registry/domains/feed/config.ts`

Example sequence:
- 3 video posts -> 1 suggestion -> 1 quiz -> repeat.

## Presorted Feed (Job)
Presort builds cached feed segments using the same sequence and scoring logic.
- Job: `feed-presort`
- Storage: `PresortedFeedSegment` table

## Jobs System
Jobs precompute expensive data and keep API latency stable.

Implemented:
- `match-scores` (suggestion discovery)
- `compatibility` (relationship view)
- `content-features`
- `trending`
- `affinity`
- `feed-presort`
- `feed-presort-cleanup`
- `stats-reconcile` (reconcile statistics counters)
- `media-orphan-cleanup` (cleanup orphaned media files)
- `media-metadata` (extract metadata for a single media file)
- `media-metadata-batch` (extract metadata for multiple media files)
- `build-user-traits` (build user traits from quiz results)
- `profile-search-index` (build profile search index)
- `user-interest-sets` (build user interest sets for search)
- `searchable-user` (build searchable user snapshot)
- `quiz-answer-stats` (aggregate quiz answer statistics by demographics)
- `interest-relationships` (interest correlation prep)
- `science-sample-pairs` (science sampling)
- `science-daily-stats` (science stats rollup)
- `science-interest-correlations` (interest correlation metrics)

Unified CLI:
```
cd backend
pnpm jobs:run match-scores --userId=8
pnpm jobs:run content-features --batchSize=50
pnpm jobs:run trending --windowHours=48 --minEngagements=5
pnpm jobs:run affinity --userId=8
pnpm jobs:run feed-presort --userId=8
pnpm jobs:run stats-reconcile --lookbackHours=24 --batchSize=200
pnpm jobs:run build-user-traits --userId=8 --batchSize=100
pnpm jobs:run profile-search-index --userBatchSize=100
pnpm jobs:run user-interest-sets --batchSize=1000
pnpm jobs:run searchable-user --userBatchSize=100
pnpm jobs:run quiz-answer-stats
```

## Matching System (High Level)
- Users send likes/dislikes.
- Mutual likes create a Match + Conversation.
- Suggestions are driven by MatchScore; matches are relationship state.

## Seeding
Scripts live in `backend/scripts/`.
Common entry points:
```
cd backend
pnpm seed:all
pnpm seed:mass
pnpm seed:activity
```

## Local Setup
1) Install dependencies:
```
pnpm install
```
2) Configure database:
```
backend/.env
DATABASE_URL=...
```
3) Prisma generate + sync:
```
cd backend
pnpm prisma:generate
pnpm prisma db push --schema prisma/schema
```
4) Start dev servers:
```
pnpm run dev:backend
pnpm run dev:frontend
```

## OpenAPI Types
Backend emits OpenAPI; frontend consumes generated types.
```
cd backend
npm run openapi:emit
cd ../frontend
npm run openapi:types
```
