# Site Seeding Plan - Large Scale Mock Data Generation

## Overview

Scale the current seeding infrastructure to generate hundreds of realistic profiles and simulate authentic site activity for testing and development.

**Core Principles:**
1. **Deterministic** - Reproducible runs using seeded PRNG (no `Math.random()`)
2. **Separate generation from insertion** - Generate objects first, batch insert after
3. **Two-phase strict** - Profile creation → Activity simulation
4. **Jobs own derived data** - Seeder creates raw facts, jobs compute relationships/scores
5. **Append-safe** - Can extend activity without reshuffling past data

## Current State Analysis

### Existing Infrastructure
- **seedAll.ts** - Orchestrator with CLI flags for selective seeding
- **seedProfiles.ts** - Basic 4 hardcoded profiles
- **seedFeedDemo.ts** - 10 detailed personas + synthetic generation capability
- **seedQuizzes.ts** - Quiz setup with automated result generation
- **seedInterests.ts** - Subject/interest taxonomy with random assignment

### Current Limitations
1. Only 10 detailed personas (expandable but uses same images)
2. Limited name pool (15 names)
3. Limited bio templates (6 templates)
4. Minimal activity simulation (hardcoded likes/messages)
5. No temporal activity patterns
6. Image reuse across synthetic profiles
7. **Non-deterministic** - Uses Math.random(), can't reproduce runs
8. **Mixed concerns** - Generation and insertion interleaved
9. **Job overlap** - Some seeders try to compute derived data

## Architecture Strategy

### Phase 1: Deterministic RNG Foundation

#### 1.1 Seeded PRNG Implementation
Create `backend/scripts/lib/prng.ts`:

```typescript
// Simple, fast, deterministic PRNG (xoshiro128**)
export function makeRng(seed: string) {
  const hash = hashString(seed);
  let state = [hash[0], hash[1], hash[2], hash[3]];
  
  return {
    next(): number {
      // Returns 0-1, deterministic
      const result = rotl(state[1] * 5, 7) * 9;
      const t = state[1] << 9;
      state[2] ^= state[0];
      state[3] ^= state[1];
      state[1] ^= state[2];
      state[0] ^= state[3];
      state[2] ^= t;
      state[3] = rotl(state[3], 11);
      return (result >>> 0) / 4294967296;
    },
    nextInt(max: number): number {
      return Math.floor(this.next() * max);
    },
    choice<T>(arr: T[]): T {
      return arr[this.nextInt(arr.length)];
    },
    shuffle<T>(arr: T[]): T[] {
      const result = [...arr];
      for (let i = result.length - 1; i > 0; i--) {
        const j = this.nextInt(i + 1);
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    }
  };
}

// Pattern: rng = makeRng(`${runSeed}:${userId}:${namespace}`)
export function makeUserRng(runSeed: string, userId: bigint, namespace: string) {
  return makeRng(`${runSeed}:${userId}:${namespace}`);
}

export function makeDayRng(runSeed: string, userId: bigint, day: number, namespace: string) {
  return makeRng(`${runSeed}:${userId}:day${day}:${namespace}`);
}
```

**Critical:** No `Math.random()` anywhere in seeding code. Always use RNG with seed.

#### 1.2 Mock Data Generator Library
Create `backend/scripts/lib/mockDataGenerator.ts` with utilities:

```typescript
interface MockDataGenerator {
  // Profile Data (all accept RNG instance)
  generateName(rng: RNG, gender: Gender): string;
  generateBio(rng: RNG, interests: string[]): string;
  generateAge(rng: RNG): number;
  generateLocation(rng: RNG): LocationData;
  
  // Content
  generatePostText(rng: RNG, personality: string): string;
  generateMessageThread(rng: RNG, userA: PersonalityProfile, userB: PersonalityProfile, count: number): Message[];
  
  // Behavior
  generateActivityPattern(rng: RNG, personality: string): ActivityPattern;
  shouldLike(rng: RNG, userA: Profile, userB: Profile, compatibility: number): boolean;
}
```

**Data Sources:**
- **Names:** Large arrays (100+ per gender)
- **Bios:** Template system with variable substitution
- **Posts:** 200+ text templates categorized by topic
- **Messages:** Conversation templates with personality modifiers
- **Lorem Ipsum:** For filler content where realism doesn't matter

**Key:** All randomness comes from passed RNG, never `Math.random()`

#### 1.3 Profile Image Strategy
**Recommended: picsum.photos with deterministic seeds**

```typescript
function getProfileMedia(runSeed: string, userId: bigint, count: number): MediaSeed[] {
  const rng = makeUserRng(runSeed, userId, 'media');
  return Array.from({ length: count }, (_, i) => {
    const seed = rng.nextInt(100000);
    return {
      type: 'IMAGE',
      url: `https://picsum.photos/seed/${seed}/800/600`,
      thumbUrl: `https://picsum.photos/seed/${seed}/400/300`,
    };
  });
}
```

**Important:**
- Store both `url` and `thumbUrl` deterministically
- **Don't download** images during seed (avoid timeouts/rate limits)
- If you need "face-like avatars", `pravatar.cc` works but can be brittle
- Picsum is stable and works well for testing

**Alternative:** Pre-generated image pool (100+ Unsplash/Pexels URLs) selected via RNG

### Phase 2: Profile Generation (In-Memory First)

#### 2.1 Generate, Don't Insert
**Critical Pattern: Two-step process**

```typescript
// Step 1: Generate (fast, parallelizable)
const profiles = generateProfiles(runSeed, count);

// Step 2: Insert in batches
await insertProfilesBatch(profiles, batchSize);
```

**Benefits:**
- Fast generation (pure JS, no DB calls)
- Parallelizable (can use worker threads if needed)
- Debuggable (inspect objects before insertion)
- Resumable (save generation state, restart insertion)

#### 2.2 Scalable Profile Generator
Create `backend/scripts/lib/profileGenerator.ts`:

**Name Generation:**
- 100+ first names per gender category
- Optional last name/initial support
- Gender-neutral name pool
- **Use RNG:** `generateName(rng, gender)`

**Bio Generation:**
- 50+ bio templates with placeholders
- Personality archetypes (adventurous, creative, intellectual, etc.)
- Interest-based content injection
- Variable length (short, medium, long)
- **Use RNG:** `generateBio(rng, archetype, interests)`

**Location Distribution:**
- 50+ US cities with real coordinates
- Clustering for realistic distance matching
- Optional: International locations
- **Use RNG:** `generateLocation(rng)` with weighted selection

**Demographics:**
- Age range: 18-65 with normal distribution peak at 25-35
- Gender distribution: configurable ratios
- Intent distribution: weighted by realism
- **Use RNG:** All distributions via RNG methods

#### 2.3 Personality System
Create profiles with consistent personalities affecting all behavior:

```typescript
interface PersonalityProfile {
  archetype: 'adventurer' | 'intellectual' | 'social' | 'creative' | 'athletic' | 'casual';
  traits: {
    sociability: number; // 0-1: affects posting frequency, message response rate
    selectivity: number; // 0-1: affects like/dislike ratio
    engagement: number; // 0-1: affects quiz completion, profile detail
  };
  interests: string[]; // 3-8 interests from taxonomy
  preferredTopics: string[]; // for post generation
}

function generatePersonality(rng: RNG): PersonalityProfile {
  const archetype = rng.choice(['adventurer', 'intellectual', 'social', 'creative', 'athletic', 'casual']);
  return {
    archetype,
    traits: {
      sociability: rng.next() * 0.6 + 0.2, // 0.2-0.8
      selectivity: rng.next() * 0.5 + 0.3, // 0.3-0.8
      engagement: rng.next() * 0.4 + 0.4, // 0.4-0.8
    },
    interests: generateInterests(rng, archetype, rng.nextInt(6) + 3), // 3-8
    preferredTopics: deriveTopics(archetype)
  };
}
```

**Usage:**
- Determines quiz answers (80-90% match archetype)
- Influences like/dislike decisions via selectivity
- Shapes message content and frequency via sociability
- Affects post topics and cadence via engagement

### Phase 3: Activity Simulation (Append-Only, Time-Based)

#### 3.1 Temporal Activity Engine
Create `backend/scripts/lib/activitySimulator.ts`:

**Critical: Time is deterministic**
- Use fixed `startDate` parameter (e.g., "2024-01-01")
- Generate activity as day offsets from startDate
- Pattern: `const rng = makeDayRng(runSeed, userId, dayOffset, 'posts')`

**Time-based Activity:**
- Generate activity over configurable time window (default: 30 days)
- Activity patterns based on personality:
  - High engagement: posts every 2-3 days, checks feed daily
  - Medium: posts weekly, checks every 2-3 days
  - Low: posts bi-weekly, sporadic checking

**Activity Types (Generated In-Memory First):**
1. **Posts:** Create content at personality-driven cadence
2. **Profile Views:** Influenced by location/age/intent buckets
3. **Feed Interactions:** View posts, like posts (20-40% of views)
4. **Likes:** See profiles, decide like/dislike based on compatibility
5. **Matches:** Emergent from mutual likes
6. **Messages:** Generated only after matches exist

**Activity Generation Order:**
```typescript
// Day-by-day simulation
for (let day = 0; day < activityDays; day++) {
  const posts = generatePostsForDay(runSeed, users, day);
  const views = generateViewsForDay(runSeed, users, day);
  const likes = generateLikesForDay(runSeed, users, day);
  const matches = deriveMatches(likes); // emergent
  const messages = generateMessagesForDay(runSeed, matches, day);
  
  // Insert in batches
  await insertBatch('posts', posts);
  await insertBatch('profileViews', views);
  await insertBatch('likes', likes);
  await insertBatch('matches', matches);
  await insertBatch('messages', messages);
}
```

#### 3.2 Compatibility-Driven Behavior

**Critical: Avoid N² scans**
- **Pre-bucket users** by city/age/intent first
- Sample candidates from relevant buckets only
- Never loop "for each user, scan all users"

```typescript
// Pre-bucketing strategy
const buckets = new Map<string, Profile[]>();
for (const user of users) {
  const key = `${user.city}:${Math.floor(user.age / 5)}:${user.intent}`;
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(user);
}

// Sample candidates efficiently
function getCandidates(user: Profile, count: number): Profile[] {
  const key = `${user.city}:${Math.floor(user.age / 5)}:${user.intent}`;
  const pool = buckets.get(key) || [];
  return pool.slice(0, count); // or rng.shuffle(pool).slice(0, count)
}
```

**Smart Pairing with Personality:**
```typescript
function calculateLikeProbability(
  rng: RNG,
  userA: Profile,
  userB: Profile,
  quizCompatibility: number,
  distanceKm: number
): number {
  // Make base probability personality-driven
  const base = lerp(0.05, 0.35, 1 - userA.traits.selectivity);
  
  let probability = base;
  probability += quizCompatibility * 0.4; // 40% weight
  probability += (distanceKm < 50 ? 0.3 : 0.1); // proximity bonus
  probability += calculateInterestOverlap(userA, userB) * 0.2;
  
  // Hard clamp for obvious mismatches
  if (isIntentMismatch(userA, userB)) probability *= 0.1;
  if (isAgeMismatch(userA, userB)) probability *= 0.3;
  
  return Math.min(probability, 0.95);
}

function shouldLike(rng: RNG, probability: number): boolean {
  return rng.next() < probability;
}
```

**Target Outcomes (Emergent):**
- Match rate: 5–15% of likes become matches
- Response rate: 60–80%
- Active posting: 1–3/week
- Feed engagement: 20–40%

#### 3.3 Message Generation
**Conversation Flow:**
1. Match created (mutual like)
2. Opener sent by initiator (higher sociability sends first)
3. Response probability based on message quality + compatibility
4. 2-10 message exchanges
5. Natural dropoff or sustained conversation

**Message Content:**
- Template-based with personality injection
- Reference profile details (interests, bio, posts)
- Progressive intimacy (casual → personal)
- Use lorem ipsum for less critical content

### Phase 4: Quiz Result Generation (Input for Jobs)

#### 4.1 Personality-Driven Answers
Replace modulo-based answers with personality-driven selection:

```typescript
function generateQuizAnswers(
  rng: RNG,
  personality: PersonalityProfile,
  quiz: Quiz
): QuizAnswers {
  const answers: Record<string, string> = {};
  const scoreVec: number[] = [];
  
  for (const question of quiz.questions) {
    // Match answers to personality archetype
    const preferredAnswer = matchQuestionToArchetype(question, personality.archetype);
    
    // 90% match to archetype, 10% inconsistent (humans aren't perfect)
    const selectedAnswer = rng.next() < 0.9 
      ? preferredAnswer 
      : rng.choice(question.options);
    
    answers[question.id] = selectedAnswer.value;
    
    // Compute score vector (0-1 normalized)
    const optIndex = question.options.indexOf(selectedAnswer);
    const denom = Math.max(1, question.options.length - 1);
    scoreVec.push(optIndex / denom);
  }
  
  return { answers, scoreVec };
}
```

#### 4.2 Realistic Distribution
- Not all users complete quiz (80-90% completion rate)
- Use RNG to decide: `if (rng.next() < 0.85) { generateQuizAnswers(...) }`
- Answer distribution looks organic (avoid perfect patterns)
- Some inconsistent answers via 10% randomness

#### 4.3 What NOT to Generate
**Seeder creates:** QuizAnswer (raw answers)
**Jobs compute:** 
- QuizAnswerStats (aggregations)
- User traits (via build-user-traits job)
- Compatibility scores (via match-scores job)

### Phase 5: Implementation - Phased Insertion

#### 5.1 Strict Two-Phase Seeding

**Phase A: Identity & Profile (no graph edges)**
```typescript
// seedMassProfiles.ts
async function seedMassProfiles(runSeed: string, count: number) {
  // 1. Generate all profiles in-memory (fast)
  const profiles = generateProfiles(runSeed, count);
  
  // 2. Insert in batches
  await insertUsers(profiles, 50); // batch size 50-100
  await insertProfiles(profiles, 50);
  await insertProfileMedia(profiles, 100);
  await insertUserInterests(profiles, 100);
  await markInterestsDirty(profiles, 100);
  await insertQuizAnswers(profiles, 100); // 80-90% completion
  
  return { runSeed, count, userIds: profiles.map(p => p.userId) };
}
```

**No transactions needed** - tables are independent at this phase.

**Phase B: Activity Simulation (time-based, append-only)**
```typescript
// seedActivity.ts
async function seedActivity(runSeed: string, startDate: Date, days: number) {
  const users = await loadUsers(); // load IDs + personality only
  const buckets = preBucketUsers(users); // city/age/intent
  
  for (let day = 0; day < days; day++) {
    // Generate in-memory first
    const posts = generatePostsForDay(runSeed, users, day);
    const views = generateViewsForDay(runSeed, buckets, day);
    const likes = generateLikesForDay(runSeed, buckets, day);
    const matches = deriveMatches(likes); // from mutual likes
    const messages = generateMessagesForDay(runSeed, matches, day);
    
    // Insert chronologically in batches
    await insertBatch('posts', posts, 100);
    await insertBatch('feedSeen', views, 500);
    await insertBatch('likes', likes, 200);
    await insertBatch('matches', matches, 50); // smaller batch
    await insertBatch('messages', messages, 100);
    
    await pause(20); // 10-30ms between batches
  }
}
```

**Only Match + first Message** may need a small transaction for consistency.

#### 5.2 New Seed Scripts

**backend/scripts/seedMassProfiles.ts**
```bash
# Generate 500 profiles with interests + quiz answers
node seedMassProfiles.ts --runSeed=demo-2024 --count=500
```

**backend/scripts/seedActivity.ts**
```bash
# Simulate 30 days of activity
node seedActivity.ts --runSeed=demo-2024 --startDate=2024-01-01 --days=30
```

**Optional: backend/scripts/seedRun.ts**
```typescript
// Track seed runs for incremental activity
interface SeedRun {
  id: bigint;
  seed: string;
  createdAt: Date;
  profileCount: number;
  activityDays: number;
}
```

**backend/scripts/lib/ (new utilities)**
- `prng.ts` - Seeded PRNG implementation
- `mockDataGenerator.ts` - Data templates and generation
- `profileGenerator.ts` - Profile assembly
- `activitySimulator.ts` - Activity generation engine
- `personalityEngine.ts` - Personality system
- `batchInserter.ts` - Efficient batch insertion helpers

#### 5.3 Enhanced seedAll.ts Orchestration
```typescript
// seedAll.ts - orchestrates profiles + activity + jobs
async function seedAll() {
  const runSeed = parseArg('--runSeed', `seed-${Date.now()}`);
  const count = parseIntArg('--count', 100);
  const activityDays = parseIntArg('--activityDays', 30);
  const startDate = parseArg('--startDate', '2024-01-01');
  const skipActivity = parseFlag('--skipActivity');
  const skipJobs = parseFlag('--skipJobs');
  
  // Phase 1: Profiles
  console.log(`Seeding ${count} profiles...`);
  await seedMassProfiles(runSeed, count);
  
  // Phase 2: Activity
  if (!skipActivity) {
    console.log(`Simulating ${activityDays} days of activity...`);
    await seedActivity(runSeed, new Date(startDate), activityDays);
  }
  
  // Phase 3: Jobs (compute derived data)
  if (!skipJobs) {
    console.log('Running jobs...');
    await runJobSequence([
      'interest-relationships',
      'searchable-user',
      'build-user-traits',
      'match-scores',
      'quiz-stats',
      'trending'
    ]);
  }
  
  console.log('Seed complete!');
}
```

**Usage:**
```bash
# Full seed
node seedAll.ts --runSeed=demo-2024 --count=500 --activityDays=30

# Profiles only
node seedAll.ts --count=200 --skipActivity

# Add activity later
node seedActivity.ts --runSeed=demo-2024 --startDate=2024-02-01 --days=30
```

### Phase 6: Job Integration

#### 6.1 What Seeder Creates (Raw Facts)
**Phase A - seedMassProfiles:**
- `User` (email, password hash)
- `Profile` (displayName, bio, birthdate, location, gender, intent)
- `ProfileMedia` (images with deterministic URLs, no downloads)
- `UserInterest` (3-8 per user)
- `InterestDirty` (mark touched interests)
- `QuizAnswer` (80-90% of users, personality-driven)

**Phase B - seedActivity:**
- `Post` (text, media, timestamps)
- `FeedSeen` (view records)
- `ProfileView` (who viewed whom)
- `Like` (LIKE/DISLIKE actions)
- `Match` (derived from mutual likes)
- `Message` (conversation threads)

#### 6.2 What Jobs Compute (Derived Data)
**Never seed these tables:**
- ❌ `MatchScore` (computed by match-scores job)
- ❌ `InterestRelationship` (computed by interest-relationships job)
- ❌ `SearchableUser` (snapshot from searchable-user job)
- ❌ `QuizAnswerStats` (aggregations from quiz-stats job)
- ❌ `UserTraits` (computed by build-user-traits job)
- ❌ `Trending*` (computed by trending jobs)

#### 6.3 Job Execution Order
```typescript
async function runJobSequence(jobs: string[]) {
  // 1. Interest relationships (needs UserInterest + InterestDirty)
  await runInterestRelationshipsJob();
  
  // 2. Searchable user snapshot (needs Profile fields)
  await runSearchableUserJob();
  
  // 3. Build user traits (needs QuizAnswer)
  await runBuildUserTraitsJob();
  
  // 4. Match scores (needs traits + interests + profiles)
  await runMatchScoreJob({
    userBatchSize: 100,
    candidateBatchSize: 500,
    pauseMs: 50
  });
  
  // 5. Optional: Quiz stats, trending, etc.
  if (jobs.includes('quiz-stats')) await runQuizStatsJob();
  if (jobs.includes('trending')) await runTrendingJob();
}
```

#### 6.4 Performance Optimization

**Batch sizes (safe on Railway/local):**
- Users/Profiles: 50-100 rows
- Media/Interests: 100-200 rows
- Activity (posts/likes/views): 200-500 rows
- Messages: 100 rows
- Pause between batches: 10-30ms

**Avoid:**
- ❌ Nested awaits in loops
- ❌ N² user scans (pre-bucket by city/age/intent)
- ❌ Transactions unless truly needed (Match + Message only)
- ❌ Computing derived data (let jobs handle it)

**Use:**
- ✅ `createMany({ skipDuplicates: true })`
- ✅ Pre-bucket users before sampling
- ✅ Generate in-memory, insert in batches
- ✅ Minimal transactions (Match + first Message only)

### Phase 7: Deterministic Seeding Keys

#### 7.1 Hierarchical Seed Structure
```
runSeed (e.g., "demo-2024")
  └─ userId (e.g., 123n)
      ├─ profile     → makeUserRng(runSeed, userId, "profile")
      ├─ media       → makeUserRng(runSeed, userId, "media")
      ├─ interests   → makeUserRng(runSeed, userId, "interests")
      ├─ quiz        → makeUserRng(runSeed, userId, "quiz")
      └─ activity:day
          ├─ day0:posts    → makeDayRng(runSeed, userId, 0, "posts")
          ├─ day0:likes    → makeDayRng(runSeed, userId, 0, "likes")
          ├─ day1:posts    → makeDayRng(runSeed, userId, 1, "posts")
          └─ ...
```

**Benefits:**
- **Reproducible:** Same runSeed produces identical output
- **Debuggable:** Can regenerate single user by ID
- **Append-safe:** Can extend activity without reshuffling past
- **Independent:** Each feature/day has isolated randomness

#### 7.2 Validation Rules
- No duplicate emails (use `test.user${userId}@example.com`)
- Age appropriate content and preferences
- Realistic location clustering (pre-bucket)
- Balanced gender/intent distribution (use weighted RNG)
- **Sanity checks after seed:**
  - `users.count == profiles.count`
  - `~3-8 interests per user`
  - `5-15% like → match ratio`
  - `message threads ≥ 2 msgs on most matches`
  - Search results populated after job run

#### 7.3 Realism Targets (Emergent Outcomes)
These should emerge from personality + compatibility logic:
- Match rate: 5-15% of likes become matches
- Message response rate: 60-80%
- Post frequency: 1-3 per week for active users
- Feed engagement: 20-40% of viewed items get interaction

**Implementation:** Don't hardcode ratios. Let them emerge from:
- `sociability` trait
- `selectivity` trait
- `compatibility` scores
- `distance` proximity
- Time-of-day patterns (optional)

#### 7.4 Edge Cases (Realism)
- Some profiles incomplete (no posts, no quiz) - 10-20%
- Some users inactive (no recent activity) - 15%
- Some conversations one-sided (no reply) - 20-30%
- Some posts with no likes - 40%
- Some matches with no messages - 10%

## Implementation Priority

### Phase 1 (Foundation - Day 1-2)
1. ⚪ **Seeded PRNG** (`lib/prng.ts`)
   - xoshiro128** or similar
   - `makeRng`, `makeUserRng`, `makeDayRng` helpers
   - Replace all `Math.random()` usage

2. ⚪ **Mock data pools** (`lib/mockDataGenerator.ts`)
   - 100+ names per gender
   - 50+ bio templates
   - 200+ post text templates
   - 50+ locations with coords

3. ⚪ **Batch insertion helpers** (`lib/batchInserter.ts`)
   - `insertBatch(table, rows, batchSize, pauseMs)`
   - `createMany` with error handling

### Phase 2 (Profile Generation - Day 3-4)
4. ⚪ **Profile generator** (`lib/profileGenerator.ts`)
   - Generate profiles in-memory
   - Personality system with traits
   - Deterministic media URLs (picsum)
   - Interest selection (3-8 per user)

5. ⚪ **seedMassProfiles.ts**
   - Generate N profiles
   - Insert Phase A tables (User, Profile, Media, Interests, Quiz)
   - Mark InterestDirty
   - CLI: `--runSeed --count`

### Phase 3 (Activity Simulation - Day 5-6)
6. ⚪ **Activity simulator** (`lib/activitySimulator.ts`)
   - Pre-bucket users by city/age/intent
   - Generate day-by-day activity
   - Compatibility-driven likes
   - Message generation

7. ⚪ **seedActivity.ts**
   - Day-by-day loop
   - Generate Posts, Likes, Matches, Messages
   - Insert chronologically in batches
   - CLI: `--runSeed --startDate --days`

### Phase 4 (Integration - Day 7)
8. ⚪ **Job orchestration** (enhance `seedAll.ts`)
   - Run seedMassProfiles
   - Run seedActivity (optional)
   - Run job sequence
   - CLI: `--count --activityDays --skipJobs`

9. ⚪ **Validation & sanity checks**
   - Post-seed validation
   - Emergent metric checks
   - Debug single user by seed

### Phase 5 (Polish - Day 8+)
10. ⚪ **Optional: SeedRun table**
    - Track runs for incremental activity
    - `--seedRunId` to append safely

11. ⚪ **Performance tuning**
    - Benchmark 1000 profiles
    - Optimize batch sizes
    - Target: <10min for 1000 profiles + 30 days

## Usage Examples

### Full Seed (Profiles + Activity + Jobs)
```bash
cd backend
node scripts/seedAll.ts --runSeed=demo-2024 --count=500 --activityDays=30
```

### Profiles Only (Then Run Jobs Manually)
```bash
node scripts/seedMassProfiles.ts --runSeed=demo-2024 --count=500
# Then run jobs:
node scripts/runJob.ts interest-relationships
node scripts/runJob.ts searchable-user
node scripts/runJob.ts build-user-traits
node scripts/runJob.ts match-scores
```

### Activity Only (Append to Existing)
```bash
# Add 30 more days of activity to existing profiles
node scripts/seedActivity.ts --runSeed=demo-2024 --startDate=2024-02-01 --days=30
```

### Quick Test Dataset (50 Profiles, 7 Days)
```bash
node scripts/seedAll.ts --runSeed=test-quick --count=50 --activityDays=7
```

### Production-like Dataset (1000 Profiles, 90 Days)
```bash
node scripts/seedAll.ts \
  --runSeed=prod-sim-2024 \
  --count=1000 \
  --activityDays=90 \
  --startDate=2023-10-01
```

### Debug Single User (Regenerate from Seed)
```bash
# Recreate user 123's profile to debug generation
node scripts/debugUser.ts --runSeed=demo-2024 --userId=123
```

## Data Cleanup

### Reset All Seeded Data
```sql
-- Careful! This deletes everything
TRUNCATE TABLE users CASCADE;
TRUNCATE TABLE interest_subjects CASCADE; -- if re-seeding interests
```

### Reset Activity Only (Keep Profiles)
```sql
-- Keep User + Profile, remove all activity
DELETE FROM likes;
DELETE FROM matches;
DELETE FROM messages;
DELETE FROM posts;
DELETE FROM feed_seen;
DELETE FROM profile_views;
DELETE FROM liked_posts;
```

### Reset Derived Data (Re-run Jobs)
```sql
-- Remove job-computed data
DELETE FROM match_scores;
DELETE FROM interest_relationships;
DELETE FROM searchable_users;
DELETE FROM quiz_answer_stats;
DELETE FROM user_traits;
```

## Testing Approach

### Determinism Tests
```typescript
test('same seed produces identical profiles', () => {
  const profiles1 = generateProfiles('test-seed', 100);
  const profiles2 = generateProfiles('test-seed', 100);
  expect(profiles1).toEqual(profiles2);
});

test('different seeds produce different profiles', () => {
  const profiles1 = generateProfiles('seed-1', 100);
  const profiles2 = generateProfiles('seed-2', 100);
  expect(profiles1).not.toEqual(profiles2);
});
```

### Unit Tests
- RNG determinism (same seed → same output)
- Mock data generator output validation
- Profile generation consistency
- Compatibility calculation logic
- Bucket sampling efficiency

### Integration Tests
- Full seed cycle completion
- Data integrity (foreign keys, constraints)
- Performance benchmarks (profiles/second)
- Job execution order
- Sanity check validations

### Manual Validation
- Browse generated profiles in app
- Check message threads for coherence
- Verify match compatibility seems reasonable
- Confirm activity timestamps logical
- Verify emergent metrics (5-15% match rate, etc.)

## Future Enhancements

1. **Advanced Personalities:**
   - More detailed personality models
   - Relationship progression over time
   - User lifecycle stages (new, active, dormant, churned)

2. **Machine Learning Integration:**
   - Train on generated data
   - Validate recommendation algorithms
   - Test matching improvements

3. **Scenario Testing:**
   - Generate specific test scenarios
   - Edge case profiles
   - Problematic content detection testing

4. **Performance Testing:**
   - Generate 10k+ profiles
   - Stress test matching algorithms
   - Feed generation benchmarks

5. **Analytics Validation:**
   - Realistic activity for metric testing
   - Cohort analysis data
   - A/B test simulation

## Critical Gotchas to Avoid

### ❌ N² Generation
**Never:** Loop "for each user, scan all users" during seeding
**Always:** Pre-bucket by city/age/intent, then sample from buckets

### ❌ DB Hot Loops
**Never:** `await prisma.x.create()` per row
**Always:** Batch with `createMany` + occasional upsert

### ❌ Non-Deterministic Time Windows
**Never:** Use `Date.now()` or `Math.random()` for timestamps
**Always:** Use fixed `startDate` + day offsets + RNG

### ❌ Message Threads Referencing Missing Data
**Never:** Generate messages before matches exist
**Always:** Generate matches first, then messages

### ❌ Computing Derived Data in Seeder
**Never:** Calculate match scores, interest relationships, etc.
**Always:** Let jobs compute derived data

### ❌ Mixed Generation and Insertion
**Never:** Generate one profile, insert it, generate next
**Always:** Generate all profiles, then insert in batches

## Notes

- **Lorem Ipsum is OK**: For testing/dev, content quality matters less than volume and variety
- **Deterministic Everything**: Use seeded RNG for all randomness - no `Math.random()`
- **Privacy**: All data is fake - use obviously fake emails (`test.user${userId}@example.com`)
- **Performance Target**: 1000 profiles with 30 days activity in < 10 minutes
- **Maintenance**: Run seedAll.ts on fresh DB to reset to clean state
- **Append-Safe**: Can add more activity days without reshuffling past data
- **Jobs Separate**: Seeder creates raw facts, jobs derive meaning

## Success Metrics

✅ **Determinism:** Same runSeed produces identical output every time
✅ **Scale:** Generate 1000+ profiles in single run
✅ **Activity:** Create 30-90 days of realistic activity per profile
✅ **Realism:** Match/message patterns look organic (emergent metrics in range)
✅ **Integration:** Feed and search results populated after job run
✅ **Performance:** < 10min for 1000 profiles + 30 days activity
✅ **Append-Safe:** Can extend activity without regenerating profiles
✅ **Debuggable:** Can regenerate single user from seed for debugging

## Minimal Script Set

### Required
1. **seedMassProfiles.ts** - Create User/Profile/Media/Interests/Quiz
2. **seedActivity.ts** - Simulate Posts/Likes/Matches/Messages over time
3. **seedAll.ts** - Orchestrate profiles + activity + jobs

### Library
4. **lib/prng.ts** - Seeded PRNG (xoshiro128**)
5. **lib/mockDataGenerator.ts** - Data pools and templates
6. **lib/profileGenerator.ts** - Profile assembly logic
7. **lib/activitySimulator.ts** - Activity generation logic
8. **lib/batchInserter.ts** - Efficient batch insertion

### Optional
9. **seedRun.ts** - Track runs for incremental seeding
10. **debugUser.ts** - Regenerate single user for debugging
