# Quiz System Analysis & Proposal

## Executive Summary

The quiz system currently supports:
- **Database models** for quizzes, questions, options, and results
- **API endpoints** for fetching active quiz and submitting answers
- **Feed integration** where individual quiz questions appear as feed cards (not entire quizzes)
- **Basic quiz-taking UI** via QuizPage component
- **Inline question answering** directly from feed cards

**Primary Goal:** Make quiz answers central to matching/compatibility scoring.

**Missing features:**
- Trait-based matching system (traitValues on QuizOption, UserTrait aggregation)
- Quiz results display on user profiles
- Quiz index/catalog with category organization
- Enhanced dedicated quiz-taking experience

---

## Current Implementation

### 1. Database Schema

**Location:** `backend/prisma/schema/quiz.prisma`

```prisma
model Quiz {
  id        BigInt   @id @default(autoincrement())
  slug      String   @unique
  title     String
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  questions QuizQuestion[]
  results   QuizResult[]
  feedQuestions FeedQuestion[]  // For associating questions to feed targets
}

model QuizQuestion {
  id        BigInt   @id @default(autoincrement())
  quizId    BigInt
  prompt    String   @db.Text
  order     Int
  quiz      Quiz @relation(fields: [quizId], references: [id])
  feedQuestions FeedQuestion[]
  options   QuizOption[]
  @@unique([quizId, order])
}

model QuizOption {
  id          BigInt @id @default(autoincrement())
  questionId  BigInt
  label       String
  value       String
  order       Int
  traitValues Json?  // Map of trait keys to weights (-10 to +10), e.g. {"personality.funny": 2, "personality.nice": -5}
  question    QuizQuestion @relation(fields: [questionId], references: [id])
  @@unique([questionId, order])
}

model QuizResult {
  id        BigInt   @id @default(autoincrement())
  userId    BigInt
  quizId    BigInt
  answers   Json      // Map of questionId -> option value
  scoreVec  Json?     // Optional numeric vector for compatibility scoring
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user      User @relation(fields: [userId], references: [id])
  quiz      Quiz @relation(fields: [quizId], references: [id])
  @@unique([userId, quizId])  // One result per user per quiz
}
```

**Location:** `backend/prisma/schema/user.prisma`

```prisma
model UserTrait {
  id        BigInt   @id @default(autoincrement())
  userId    BigInt
  traitKey  String   // e.g., "personality.funny", "values.adventure"
  value     Decimal  @db.Decimal(10,2)  // Aggregated trait value (derived from quiz answers)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user      User @relation(fields: [userId], references: [id])
  @@unique([userId, traitKey])
  @@index([userId])
  @@index([traitKey])
}
```

**Key Observations:**
- Only one quiz can be `isActive: true` at a time
- No category field exists yet
- `FeedQuestion` model exists but appears unused for current feed integration
- Results store answers as JSON map of `questionId -> optionValue`
- Optional `scoreVec` field for legacy compatibility scoring (deprecated in favor of trait-based system)
- **NEW:** `QuizOption.traitValues` stores trait weights per answer choice
- **NEW:** `UserTrait` table stores aggregated trait scores derived from quiz answers

### 2. API Endpoints

**Location:** `backend/src/registry/domains/quizzes/index.ts`

#### Current Endpoints:

1. **GET `/api/quizzes/active`** (Public)
   - Returns the single active quiz with all questions and options
   - Used by `QuizPage` component and feed question candidates
   - Response: `{ quiz: Quiz | null }`

2. **POST `/api/quizzes/:quizId/submit`** (Auth required)
   - Upserts quiz result for the authenticated user
   - Body: `{ answers: Record<string, string>, scoreVec?: number[] }`
   - Used when completing a quiz or answering questions from feed

3. **PATCH `/api/quizzes/:quizId`** (Editor only)
   - Updates quiz title
   - Requires `QUIZ_EDITOR_USER_IDS` env var or dev mode

4. **PATCH `/api/quizzes/:quizId/questions/:questionId`** (Editor only)
   - Updates question prompt

5. **PATCH `/api/quizzes/:quizId/questions/:questionId/options/:optionId`** (Editor only)
   - Updates option label

**Missing Endpoints:**
- `GET /api/quizzes` - List all quizzes (with pagination/filtering)
- `GET /api/quizzes/:quizId` - Get specific quiz by ID/slug
- `GET /api/quizzes/categories` - List quiz categories
- `GET /api/quizzes/:quizId/results` - Get user's result for a quiz
- `GET /api/profiles/:userId/quizzes` - Get all quiz results for a user profile

### 3. Feed Integration

**Location:** `backend/src/registry/domains/feed/candidates/questions.ts`

**How it works:**
- Feed system fetches the **active quiz** (only one)
- Extracts **individual questions** from that quiz (up to `feedCandidateCaps.questions.maxItems`)
- Each question becomes a separate feed card with `kind: 'question'`
- Questions appear interleaved with posts and profile suggestions in the feed

**Important Finding:** 
**Only individual quiz QUESTIONS appear in feeds, not entire quizzes.** Each question is a separate feed card.

```typescript
// Simplified flow:
1. getQuestionCandidates() → fetches active quiz
2. Extracts questions: quiz.questions.slice(0, max)
3. Each question becomes a FeedQuestionCandidate
4. Questions are ranked/scored alongside posts
5. Frontend renders question cards with RiverCardQuestion component
```

**Question Rendering in Feed:**
- Location: `frontend/src/ui/river/RiverCardQuestion.tsx`
- Users can answer questions directly from feed cards
- Answers are submitted via `useQuizAnswer` hook
- Answers stored in localStorage for optimistic updates, then synced to server

### 4. Frontend Components

#### QuizPage (`frontend/src/ui/pages/QuizPage.tsx`)
- Full quiz-taking interface
- Multi-step wizard (one question per step)
- Progress indicator
- Supports editor mode (via `?edit` query param)
- Submits all answers at once when completed

**Limitations:**
- Only works with "active" quiz (can't take other quizzes)
- No category browsing
- No quiz discovery UI

#### RiverCardQuestion (`frontend/src/ui/river/RiverCardQuestion.tsx`)
- Inline question rendering in feed
- Users answer single questions from feed cards
- Uses `useQuizAnswer` hook for submission

#### useQuizAnswer Hook (`frontend/src/core/actions/useQuizAnswer.ts`)
- Manages answer state per question
- Stores answers in localStorage
- Submits to API on selection
- Handles optimistic updates

### 5. Profile Integration

**Current Status:** Quiz results are **NOT** included in profile responses.

**Location:** `backend/src/registry/domains/profiles/index.ts` (GET `/api/profiles/:userId`)

Profile response currently includes:
- Profile data (bio, location, etc.)
- Posts
- Ratings (averages and viewer's rating)
- Compatibility scores
- Top 5 lists
- **Missing:** Quiz results

---

## Core Feature: Trait-Based Matching System

**Status:** ⚠️ **In Progress** - Schema updated, job created, integration pending

**Goal:** Make quiz answers central to matching by deriving user traits from quiz responses and using them in compatibility calculations.

### Implementation Overview

1. **QuizOption.traitValues (Schema: ✅ Complete)**
   - Each quiz answer option defines trait contributions
   - Format: `{"personality.funny": 2, "personality.nice": -5}`
   - Values range from -10 to +10
   - Example trait namespaces: `personality.*`, `values.*`, `lifestyle.*`, `interests.*`

2. **UserTrait Table (Schema: ✅ Complete)**
   - Stores aggregated trait scores per user
   - One row per user per trait
   - Values are averages of all trait contributions from quiz answers
   - Used by matching/compatibility algorithms

3. **build-user-traits Job (Implementation: ✅ Complete)**
   - **Location:** `backend/src/jobs/buildUserTraitsJob.ts`
   - Processes all quiz results for a user
   - Aggregates trait values from all answered quiz options
   - Rebuilds UserTrait table
   - Can run for single user or batch process all users

### Job Details

**Function:** `buildUserTraitsForAll(options?)`
- Batch processes all users with quiz results
- Processes in batches of 100 users (configurable)
- Skips users without quiz results

**Function:** `rebuildUserTraits(userId)`
- Rebuilds traits for a single user
- Typically called after user submits/updates quiz answers

**Algorithm:**
1. Fetch all QuizResults for user
2. For each quiz result, load questions and options
3. For each answer, look up selected option's `traitValues`
4. Accumulate trait contributions (sum and count)
5. Calculate average per trait
6. Store/update UserTrait rows

### Integration Points

**Where to call rebuildUserTraits:**
- ✅ **Integrated:** After `POST /api/quizzes/:quizId/submit` (async, fire-and-forget)
- ⏳ After updating quiz answers from feed cards (via same submit endpoint)
- ✅ **Available:** Scheduled job via `tsx scripts/runJobs.ts build-user-traits`
- ✅ **Available:** Single user rebuild via `tsx scripts/runJobs.ts build-user-traits --userId=123`

**Using UserTrait in matching:**
- Compatibility algorithms can query UserTrait table
- Compare trait values between users for similarity
- Weight traits in overall compatibility score
- Example: "personality.funny" alignment could boost compatibility

### Example Trait Taxonomy

Suggested trait categories:
- **personality.***: funny, nice, adventurous, introverted, outgoing, analytical
- **values.***: family-oriented, career-focused, spiritual, materialistic
- **lifestyle.***: active, homebody, social, independent
- **interests.***: arts, sports, travel, food, music

### Next Steps

1. ✅ Add `traitValues` to QuizOption schema
2. ✅ Create UserTrait model
3. ✅ Implement buildUserTraitsJob
4. ✅ Update quiz submission endpoint to trigger trait rebuild (async/fire-and-forget)
5. ✅ Add job to runJobs.ts script for manual/scheduled execution
6. ⏳ Update compatibility/matching algorithms to use UserTrait
7. ⏳ Create admin UI to manage traitValues on quiz options
8. ⏳ Add trait visualization to profiles
9. ⏳ Add traitValues to seed script for example quizzes

---

## Planned Features

### Feature 1: Quiz Results on User Profile

**Goal:** Display completed quiz results on user profiles, similar to how top 5 lists are shown.

**Requirements:**
1. **Backend Changes:**
   - Add quiz results to profile API response
   - Include quiz metadata (title, slug) with each result
   - Show completion date and optionally answer summaries
   - Consider privacy: only show if user has completed quiz

2. **Schema Changes:**
   - No schema changes needed (QuizResult already exists)
   - May want to add `isPublic` flag to QuizResult if users should control visibility

3. **Frontend Changes:**
   - Create `ProfileQuizResults` component
   - Display quiz title, completion date
   - Show summary of answers or quiz type indicator
   - Link to full quiz view if desired

4. **API Design:**
   ```typescript
   // Add to GET /api/profiles/:userId response
   quizResults: Array<{
     quizId: string
     quizTitle: string
     quizSlug: string
     completedAt: string
     // Optionally include answer summary or indicators
   }>
   ```

**Implementation Steps:**
1. Update profile handler to fetch user's quiz results
2. Join with Quiz table to get title/slug
3. Add to profile response schema
4. Update frontend profile component to render quiz results section
5. Add styling for quiz results display

---

### Feature 2: Quiz Index/Catalog by Category

**Goal:** Create a browsable catalog of quizzes organized by category.

**Requirements:**
1. **Schema Changes:**
   ```prisma
   // Add category enum
   enum QuizCategory {
     PERSONALITY
     COMPATIBILITY
     INTERESTS
     LIFESTYLE
     VALUES
   }

   // Add to Quiz model
   model Quiz {
     // ... existing fields
     category QuizCategory?  // Optional for backwards compatibility
     description String?      // Optional quiz description
     coverImageUrl String?    // Optional cover image
   }
   ```

2. **Backend Changes:**
   - New endpoint: `GET /api/quizzes`
     - Query params: `?category=...&limit=...&offset=...`
     - Returns list of quizzes (not just active)
     - Include metadata: title, slug, category, question count, completion count
   
   - New endpoint: `GET /api/quizzes/categories`
     - Returns list of available categories with quiz counts
   
   - New endpoint: `GET /api/quizzes/:quizId`
     - Get specific quiz by ID or slug
     - Include whether user has completed it

3. **Frontend Changes:**
   - Create `QuizIndexPage` component (`/quizzes`)
   - Category filter/tabs UI
   - Grid or list view of quizzes
   - Show completion status per quiz
   - Link to quiz detail/taking view

4. **UI Design Considerations:**
   - Card-based layout with quiz cover/title
   - Category badges
   - "Completed" indicators
   - Question count display
   - "Take Quiz" CTA buttons

**Implementation Steps:**
1. Add category enum and field to Quiz schema
2. Create migration for category field
3. Update seed script to assign categories
4. Implement `GET /api/quizzes` endpoint with filtering
5. Implement `GET /api/quizzes/categories` endpoint
6. Update OpenAPI schema
7. Create QuizIndexPage component
8. Add routing for `/quizzes` and `/quizzes/:slug`
9. Update navigation to include quizzes link

---

### Feature 3: Enhanced Quiz-Taking Experience

**Goal:** Improve the dedicated quiz-taking view with better UX and support for multiple quizzes.

**Requirements:**
1. **URL Structure:**
   - `/quizzes/:slug` - View/take specific quiz (not just active)
   - `/quizzes/:slug/results` - View results after completion
   - Keep `/quiz` route for backwards compatibility (redirects to active quiz)

2. **QuizPage Enhancements:**
   - Support taking any quiz by slug (not just active)
   - Show quiz description/intro before starting
   - Better progress visualization
   - Review/change answers before submit
   - Show results/summary after submission
   - Navigation to related quizzes

3. **New Components:**
   - `QuizIntro` - Quiz title, description, question count, estimated time
   - `QuizReview` - Review all answers before submission
   - `QuizResults` - Display results after completion
   - `QuizNavigation` - Links to other quizzes

4. **Backend Support:**
   - Update `GET /api/quizzes/:quizId` to work with slug or ID
   - Add `GET /api/quizzes/:quizId/results/:userId` for viewing results
   - Return completion status in quiz response

**Implementation Steps:**
1. Update QuizPage to accept slug parameter
2. Fetch quiz by slug/ID instead of only active
3. Add intro screen before questions
4. Add review step before submission
5. Add results display after submission
6. Update routing to support slug-based URLs
7. Add navigation between quiz steps
8. Improve styling and animations

---

## Technical Considerations

### Data Migration

When adding categories:
- Existing quizzes will have `category: null`
- May need to backfill categories for seeded quizzes
- Consider default category assignment logic

### Feed Question Strategy

**Current:** Questions from active quiz appear in feed.

**Future Options:**
1. Keep current behavior (only active quiz questions)
2. Rotate questions from multiple quizzes
3. Allow users to "pin" questions to their feed
4. Use FeedQuestion model to associate questions to specific targets (posts, profiles)

**Recommendation:** Keep current behavior for now, enhance later if needed.

### Privacy & Visibility

- Should users control visibility of quiz results?
- Add `isPublic` flag to QuizResult?
- Or always show if quiz is public?

**Recommendation:** Initially show all completed quizzes. Add privacy controls later if users request it.

### Performance

- Profile query already loads top 5 lists; adding quiz results should be minimal overhead
- Quiz index may need pagination for large catalogs
- Consider caching quiz metadata (title, category, question count)

### Compatibility Scoring

**Legacy:** The `scoreVec` field in QuizResult was used for compatibility scoring but is now **deprecated** in favor of the trait-based system.

**New Approach:** UserTrait table provides a more flexible and interpretable way to derive compatibility:
- Traits can be weighted differently in matching algorithms
- New traits can be added without changing the schema
- Trait values are human-readable and debuggable
- Can support trait-based filtering/searching in the future

---

## Implementation Priority

### Phase 0: Trait-Based Matching System (Critical Priority) ⚠️ IN PROGRESS
- **Status:** Schema complete, job implemented, integration pending
- Core feature: makes quizzes central to matching
- **Remaining work:**
  - Trigger trait rebuild on quiz submission
  - Integrate UserTrait into compatibility algorithms
  - Add traitValues to seed script for example quizzes
  - Test trait aggregation and matching calculations

### Phase 1: Profile Quiz Results (High Priority)
- Quick win: adds value immediately
- Low complexity: mostly data fetching and display
- Users can see quiz completion on profiles
- Can optionally display trait summaries

### Phase 2: Quiz Index/Catalog (Medium Priority)
- Enables quiz discovery
- Foundation for taking multiple quizzes
- Requires schema changes (category field)
- Important for trait system to have multiple quizzes

### Phase 3: Enhanced Quiz Taking (Medium Priority)
- Improves UX for dedicated quiz flow
- Enables taking any quiz (not just active)
- Adds polish and completeness

---

## Open Questions

1. **Category System:** Should categories be fixed enum or flexible tags?
   - **Recommendation:** Start with fixed enum, evolve to tags if needed

2. **Feed Questions:** Should we support questions from multiple quizzes in feed?
   - **Recommendation:** Keep single active quiz for now, enhance later

3. **Quiz Results Privacy:** Should users control visibility?
   - **Recommendation:** Show all by default, add privacy later if needed

4. **Quiz Completion Rewards:** Any gamification or achievements?
   - **Recommendation:** Out of scope for initial implementation

5. **Quiz Analytics:** Track completion rates, answer distributions?
   - **Recommendation:** Backend tracking can be added without frontend changes

---

## Files to Create/Modify

### Backend

**Schema:**
- ✅ `backend/prisma/schema/quiz.prisma` - Add traitValues to QuizOption
- ✅ `backend/prisma/schema/user.prisma` - Add UserTrait model
- ⏳ `backend/prisma/schema/quiz.prisma` - Add category, description fields (Phase 2)

**Jobs:**
- ✅ `backend/src/jobs/buildUserTraitsJob.ts` - NEW: Trait aggregation job
- ✅ `backend/scripts/runJobs.ts` - Added build-user-traits job handler

**Endpoints:**
- ✅ `backend/src/registry/domains/quizzes/index.ts` - Triggers trait rebuild on quiz submit (async)

**Endpoints:**
- `backend/src/registry/domains/quizzes/index.ts` - Add list, get by slug, categories endpoints
- `backend/src/registry/domains/profiles/index.ts` - Add quiz results to profile response

**Services:**
- `backend/src/services/quizzes/quizService.ts` - New service for quiz operations

**Migrations:**
- New migration file for category field

### Frontend

**Components:**
- `frontend/src/ui/profile/ProfileQuizResults.tsx` - New component for profile display
- `frontend/src/ui/quizzes/QuizIndexPage.tsx` - New quiz catalog page
- `frontend/src/ui/quizzes/QuizCard.tsx` - New quiz card component
- `frontend/src/ui/quizzes/QuizIntro.tsx` - New intro component
- `frontend/src/ui/quizzes/QuizReview.tsx` - New review component
- `frontend/src/ui/quizzes/QuizResults.tsx` - New results component

**Hooks:**
- `frontend/src/core/quiz/useQuiz.ts` - Hook to fetch quiz by slug
- `frontend/src/core/quiz/useQuizList.ts` - Hook to fetch quiz list
- `frontend/src/core/quiz/useQuizCategories.ts` - Hook to fetch categories

**Pages:**
- `frontend/src/ui/pages/QuizPage.tsx` - Enhance existing page
- `frontend/src/ui/pages/QuizIndexPage.tsx` - New page

**Routing:**
- Update routes to support `/quizzes`, `/quizzes/:slug`, `/quizzes/:slug/results`

**API:**
- `frontend/src/api/client.ts` - Add new quiz API methods
- `frontend/src/api/types.ts` - Add quiz-related types

---

## Testing Considerations

1. **Backend Tests:**
   - Quiz list endpoint with category filtering
   - Profile endpoint includes quiz results
   - Quiz fetching by slug/ID

2. **Frontend Tests:**
   - Quiz index page renders correctly
   - Category filtering works
   - Quiz taking flow end-to-end
   - Profile displays quiz results

3. **Integration Tests:**
   - Complete quiz flow: browse → take → view results → see on profile
   - Multiple users taking same quiz
   - Quiz results appear correctly on profiles

---

## Timeline Estimate

- **Phase 1 (Profile Quiz Results):** 2-3 days
- **Phase 2 (Quiz Index/Catalog):** 4-5 days
- **Phase 3 (Enhanced Quiz Taking):** 3-4 days

**Total:** ~10-12 days for complete implementation

---

## Conclusion

The quiz system has a solid foundation with database models, basic API endpoints, and feed integration. The three planned features will transform it from a single-quiz system to a full quiz platform with discovery, completion tracking, and profile integration.

The implementation can be done incrementally, with each phase delivering value independently.
