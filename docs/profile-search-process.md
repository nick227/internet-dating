# Profile Search Process

## Overview

The profile search system provides flexible, filtered search capabilities for finding profiles based on text, demographics, interests, traits, and location. The system uses a materialized search index (`ProfileSearchIndex`) for performance and supports multiple filter types with logical combinations.

---

## Architecture

### Components

- **`GET /api/profiles/search`**: Simple text search for @mention autocomplete
- **`GET /api/profiles/advanced-search`**: Advanced search with multiple filters
- **`GET /api/profiles/search/traits`**: Get available trait keys for filtering
- **`ProfileSearchQueryBuilder`**: Query builder class that constructs search queries
- **`ProfileSearchIndex`**: Materialized table containing searchable profile data
- **`SearchableUser`**: Materialized table for base filtering (visibility, deleted status)

### Key Design Principles

1. **Materialized Search Architecture**: Search reads from `ProfileSearchIndex` as the single source of truth
2. **Viewer-Specific Filtering**: Blocked users are filtered at query time (sparse, efficient)
3. **Composable Filters**: Filters combine with AND/OR logic as appropriate
4. **Rate Limiting**: Advanced search is rate-limited to prevent abuse

---

## Search Endpoints

### 1. Simple Search (`GET /api/profiles/search`)

**Purpose**: Fast text search for autocomplete (e.g., @mention functionality)

**Authentication**: Public (optional viewer context)

**Query Parameters**:
- `q` (required): Search query, minimum 2 characters
- `limit` (optional): Results limit, default 10, max 20

**Filters Applied**:
- Text search: `displayName` contains query (case-insensitive)
- Visibility: `isVisible = true`
- Deleted: `deletedAt IS NULL` (profile and user)
- Self: Excludes viewer's own profile (if authenticated)
- Blocked: Excludes blocked users (if authenticated)

**Response**:
```typescript
{
  users: Array<{
    id: string;
    name: string;
    displayName: string;
    avatarUrl: string | null;
  }>
}
```

**Ordering**: `displayName ASC` (alphabetical)

---

### 2. Advanced Search (`GET /api/profiles/advanced-search`)

**Purpose**: Comprehensive search with multiple filter types

**Authentication**: Public (optional viewer context)

**Query Parameters**:

#### Text Search
- `q` (optional): Search query (max 100 chars)
  - Searches: `displayName`, `bio`, `locationText`
  - Case-insensitive substring match

#### Profile Filters
- `gender` (optional, array): Filter by gender
  - Values: `MALE`, `FEMALE`, `NONBINARY`, `OTHER`, `UNSPECIFIED`
  - Multiple values = OR logic (matches any)
- `intent` (optional, array): Filter by dating intent
  - Values: `UNSPECIFIED`, `FRIENDS`, `CASUAL`, `LONG_TERM`, `MARRIAGE`
  - Multiple values = OR logic (matches any)
- `ageMin` (optional, number): Minimum age
- `ageMax` (optional, number): Maximum age
  - Note: Uses age buckets (5-year ranges) for performance
  - Formula: `bucket = floor((age - 18) / 5)`
- `location` (optional, string): Location search (max 100 chars)
  - Searches: `locationText`, `locationCity`, `locationState`, `locationCountry`
  - Case-insensitive substring match
  - Note: Does not filter by distance/proximity - uses text matching only

#### Interest Filters
- `interests` (optional, array, max 5): Filter by interest IDs
  - Logic: **AND** (must have ALL specified interests)
  - Uses `InterestUserSet` materialized table
- `interestSubjects` (optional, array): Filter by interest subject keys
  - Logic: **OR** (must have ANY of the specified subjects)
  - Uses `InterestSubjectUserSet` materialized table

#### Trait Filters
- `traits` (optional, array, max 3): Filter by traits
  - Format: JSON array of `{ key: string, min?: number, max?: number, group?: string }`
  - Default range: `-10` to `10` (if min/max not specified)
  - Logic: **AND** between groups, **OR** within groups
  - Example: `[{ key: "personality.funny", min: 5 }, { key: "personality.nice", min: 3, group: "group1" }]`
  - Allowed prefixes: `personality`, `values`

#### Sorting
- `sort` (optional): Sort order
  - Values: `newest` (default), `age`
  - `newest`: Order by `accountCreatedAt DESC, userId DESC`
  - `age`: Order by `age ASC, userId DESC`

#### Pagination
- `limit` (optional): Results per page, default 20, max 50
- `cursor` (optional): Base64-encoded cursor for pagination

**Response**:
```typescript
{
  profiles: Array<{
    userId: string;
    displayName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    heroUrl: string | null;
    locationText: string | null;
    age: number | null;
    gender: string;
    intent: string;
    matchReasons?: string[];  // e.g., ["Age: 25", "Matches 2 interests"]
  }>;
  nextCursor: string | null;
}
```

---

## Search Query Building Process

### Step 1: Initialize Base User Set

**Location**: `ProfileSearchQueryBuilder.initialize()`

1. **Base Filter**: Load all searchable users from `SearchableUser` table
   ```typescript
   where: {
     isVisible: true,
     isDeleted: false
   }
   ```
   This provides the canonical set of users eligible for search.

2. **Block Filtering** (if viewer authenticated):
   - Load all blocks where viewer is blocker OR blocked
   - Exclude blocked users from base set
   - Applied at query time (sparse, efficient)

**Result**: `baseUserIds` array containing all eligible user IDs

---

### Step 2: Build WHERE Clause

**Location**: `ProfileSearchQueryBuilder.buildWhere()`

#### 2.1 Index-Based Filters

Applied directly to `ProfileSearchIndex` WHERE clause:

- **Text Search** (`q`):
  ```typescript
  OR: [
    { displayName: { contains: q, mode: 'insensitive' } },
    { bio: { contains: q, mode: 'insensitive' } },
    { locationText: { contains: q, mode: 'insensitive' } }
  ]
  ```

- **Gender Filter**:
  ```typescript
  gender: { in: genderArray }
  ```

- **Intent Filter**:
  ```typescript
  intent: { in: intentArray }
  ```

- **Age Filter** (via `ageBucket`):
  ```typescript
  ageBucket: {
    gte: minBucket,  // floor((ageMin - 18) / 5)
    lte: maxBucket   // floor((ageMax - 18) / 5)
  }
  ```

- **Location Filter**:
  ```typescript
  OR: [
    { locationText: { contains: location, mode: 'insensitive' } },
    { locationCity: { contains: location, mode: 'insensitive' } },
    { locationState: { contains: location, mode: 'insensitive' } },
    { locationCountry: { contains: location, mode: 'insensitive' } }
  ]
  ```

#### 2.2 User ID-Based Filters

Applied via separate queries, then intersected:

- **Interests** (`interests` array):
  - Uses `InterestUserSet` table
  - Logic: **AND** (intersect all interest sets)
  - Returns: `userIds` matching ALL interests

- **Interest Subjects** (`interestSubjects` array):
  - Uses `InterestSubjectUserSet` table
  - Logic: **OR** (union all subject sets)
  - Returns: `userIds` matching ANY subject

- **Traits** (`traits` array):
  - Uses `UserTrait` table directly
  - Logic: **AND** between groups, **OR** within groups
  - Returns: `userIds` matching trait criteria
  - See "Trait Filtering Logic" section below

#### 2.3 Final Intersection

All userId-based filters are intersected:
```typescript
interests ∩ interestSubjects ∩ traits
```

Then intersected with base user IDs:
```typescript
baseUserIds ∩ (interests ∩ interestSubjects ∩ traits)
```

Final WHERE clause:
```typescript
where: {
  userId: { in: finalIntersection },
  // ... index-based filters (text, gender, intent, age, location)
}
```

---

## Trait Filtering Logic and Priority

**Location**: `ProfileSearchQueryBuilder.filterByTraits()`

### Trait Priority System

Traits use a **grouping-based priority system** that allows flexible AND/OR combinations:

#### 1. Grouped Traits (OR Logic Within Group)

**Behavior**: Traits in the same group use **OR** logic (union)

**Use Case**: "Find users who have ANY of these traits"
- Example: Find users who are either funny OR outgoing
- Multiple traits in same group = user needs to match ANY one

**Format**: `{ key: string, min?: number, max?: number, group: string }`

**Example**:
```typescript
traits: [
  { key: "personality.funny", min: 5, group: "group1" },
  { key: "personality.outgoing", min: 6, group: "group1" }
]
```
**Result**: Matches users who have EITHER:
- `personality.funny >= 5` OR
- `personality.outgoing >= 6`

#### 2. Ungrouped Traits (AND Logic)

**Behavior**: Traits without a group use **AND** logic (intersect)

**Use Case**: "Find users who have ALL of these traits"
- Example: Find users who are funny AND nice
- Multiple ungrouped traits = user needs to match ALL

**Format**: `{ key: string, min?: number, max?: number }` (no `group` field)

**Example**:
```typescript
traits: [
  { key: "personality.funny", min: 5 },
  { key: "values.honesty", min: 7 }
]
```
**Result**: Matches users who have BOTH:
- `personality.funny >= 5` AND
- `values.honesty >= 7`

#### 3. Mixed Groups (AND Between Groups, OR Within Groups)

**Behavior**: Different groups are combined with **AND** logic

**Use Case**: Complex queries like "Find users who have (trait A OR trait B) AND (trait C OR trait D) AND trait E"

**Example**:
```typescript
traits: [
  // Group 1: OR logic
  { key: "personality.funny", min: 5, group: "group1" },
  { key: "personality.outgoing", min: 6, group: "group1" },
  // Group 2: OR logic
  { key: "values.honesty", min: 7, group: "group2" },
  { key: "values.loyalty", min: 6, group: "group2" },
  // Ungrouped: AND logic
  { key: "personality.nice", min: 4 }
]
```

**Result**: Matches users who have:
- (personality.funny >= 5 OR personality.outgoing >= 6) AND
- (values.honesty >= 7 OR values.loyalty >= 6) AND
- personality.nice >= 4

### Trait Value Ranges

- **Default Range**: `-10` to `10` (if `min`/`max` not specified)
- **Allowed Prefixes**: `personality.*`, `values.*` (enforced by traits endpoint)
- **Query**: `UserTrait.value BETWEEN min AND max`
- **Value Range**: Typically `-10` to `+10` (weights from quiz answers)

### Trait Priority Summary

**Priority Order** (within a single search):
1. **Groups are evaluated first** (OR logic within each group)
2. **Groups are then intersected** (AND logic between groups)
3. **Ungrouped traits are intersected** with all groups (AND logic)

**Maximum**: 3 trait filters per query (enforced by API validation)

**Processing Flow**:
```
1. Group traits by group ID
2. For each group: Union (OR) all traits in group
3. Intersect (AND) all groups
4. Intersect (AND) ungrouped traits
5. Final result: (Group1 OR Group2 OR ...) AND (Ungrouped1 AND Ungrouped2 AND ...)
```

---

## Filter Combination Logic

### Logical Operators

1. **Text Search** (`q`): AND with all other filters
2. **Gender**: OR within array, AND with other filters
3. **Intent**: OR within array, AND with other filters
4. **Age**: Range filter (AND)
5. **Location**: Text search (AND)
6. **Interests**: AND within array, AND with other filters
7. **Interest Subjects**: OR within array, AND with other filters
8. **Traits**: Complex (see Trait Filtering Logic above)

### Filter Priority

Filters are applied in this order:

1. **Base Filter** (visibility, deleted) - always applied
2. **Block Filter** (viewer-specific) - always applied if authenticated
3. **Index-Based Filters** (text, gender, intent, age, location) - applied to `ProfileSearchIndex`
4. **User ID-Based Filters** (interests, traits) - applied separately, then intersected

**Note**: All filters use AND logic when combining different filter types. OR logic only applies within:
- Gender array
- Intent array
- Interest subjects array
- Trait groups

---

## User Filtering Capabilities

Users can filter profiles by the following criteria:

### Gender Filtering (Men, Women, etc.)

**Supported Values**:
- `MALE` - Filter for men
- `FEMALE` - Filter for women
- `NONBINARY`
- `OTHER`
- `UNSPECIFIED`

**Logic**: OR within array (matches any specified gender)

**Usage Examples**:
```
# Filter for men only
GET /api/profiles/advanced-search?gender=MALE

# Filter for women only
GET /api/profiles/advanced-search?gender=FEMALE

# Filter for men OR women
GET /api/profiles/advanced-search?gender=MALE&gender=FEMALE

# Filter for non-binary or other
GET /api/profiles/advanced-search?gender=NONBINARY&gender=OTHER
```

**Implementation**: Applied directly to `ProfileSearchIndex.gender` field using `IN` clause

### Intent Filtering (Dating, Friends, etc.)

**Supported Values**:
- `UNSPECIFIED`
- `FRIENDS` - Filter for users looking for friends
- `CASUAL` - Filter for casual dating
- `LONG_TERM` - Filter for long-term relationships
- `MARRIAGE` - Filter for marriage

**Logic**: OR within array (matches any specified intent)

**Usage Examples**:
```
# Filter for friends only
GET /api/profiles/advanced-search?intent=FRIENDS

# Filter for dating (casual OR long-term OR marriage)
GET /api/profiles/advanced-search?intent=CASUAL&intent=LONG_TERM&intent=MARRIAGE

# Filter for friends OR casual dating
GET /api/profiles/advanced-search?intent=FRIENDS&intent=CASUAL
```

**Implementation**: Applied directly to `ProfileSearchIndex.intent` field using `IN` clause

### Location Proximity (Location Filtering)

**Current Implementation**: Text-based location search (not true geographic proximity)

**Usage Examples**:
```
# Search by city
GET /api/profiles/advanced-search?location=New%20York

# Search by state
GET /api/profiles/advanced-search?location=California

# Search by country
GET /api/profiles/advanced-search?location=Canada
```

**How It Works**:
- Searches multiple location fields: `locationText`, `locationCity`, `locationState`, `locationCountry`
- Case-insensitive substring match
- Uses OR logic: matches if query appears in ANY location field
- Example: "New York" matches "New York, NY", "New York City", "Brooklyn, New York"

**Query Implementation**:
```typescript
OR: [
  { locationText: { contains: location, mode: 'insensitive' } },
  { locationCity: { contains: location, mode: 'insensitive' } },
  { locationState: { contains: location, mode: 'insensitive' } },
  { locationCountry: { contains: location, mode: 'insensitive' } }
]
```

**Limitations**:
- **No distance-based filtering**: Cannot filter by radius (e.g., "within 10 km")
- **No geographic coordinates**: Does not use latitude/longitude
- **Text matching only**: Substring match, not exact location matching
- **No proximity ranking**: Results are not sorted by distance

**Combined with Other Filters**:
```
# Filter for men in New York looking for friends
GET /api/profiles/advanced-search?gender=MALE&location=New%20York&intent=FRIENDS

# Filter for women in California looking for long-term relationships
GET /api/profiles/advanced-search?gender=FEMALE&location=California&intent=LONG_TERM
```

**Future Enhancement** (True Proximity Search):
To add distance-based filtering:
1. Store `lat`/`lng` in `ProfileSearchIndex` (from Profile table)
2. Add `radiusKm` or `maxDistanceKm` parameter
3. Calculate distance using Haversine formula
4. Filter by distance threshold: `distance <= radiusKm`
5. Optionally sort by distance (closest first)
6. Update `profileSearchIndexJob` to include lat/lng in index

---

## Search Index Maintenance (Job Structure)

### ProfileSearchIndexJob

**Location**: `backend/src/jobs/profileSearchIndexJob.ts`

**Purpose**: Background job that builds and maintains `ProfileSearchIndex` materialized table

**How It Works**:

1. **Batch Processing**: Processes users in batches (default: 100 users per batch)
2. **Index Building**: For each user, extracts and denormalizes:
   - Profile data (displayName, bio, gender, intent, age)
   - Location data (parsed into city, state, country)
   - Age bucket (5-year ranges for efficient filtering)
   - Trait summary (JSON object of all traits)
   - Top5 keywords (extracted from top5 lists)
   - Visibility and deletion status

3. **Upsert Strategy**: Uses `upsert` to create or update index entries
   - `create`: New profile, creates index entry
   - `update`: Existing profile, updates index entry with `indexedAt` timestamp

4. **Run Modes**:
   - **All users**: `buildProfileSearchIndexForAll()` - processes all users in batches
   - **Single user**: `buildProfileSearchIndex({ userId })` - processes one user
   - **Batch processing**: Processes `userBatchSize` users at a time with `pauseMs` delay

**Configuration**:
- `userBatchSize`: Number of users per batch (default: 100)
- `pauseMs`: Delay between batches in milliseconds (default: 50ms)

**When to Run**:
- Periodic full rebuild (e.g., daily)
- After profile updates (single user rebuild)
- After bulk profile changes
- Initial setup/population

### ProfileSearchIndex

**Purpose**: Materialized table containing denormalized searchable profile data

**Key Fields**:
- `userId` (primary key)
- `displayName`, `bio`, `locationText`
- `gender`, `intent`, `age`, `ageBucket`
- `locationCity`, `locationState`, `locationCountry`
- `traitSummary` (JSON object of all traits)
- `top5Keywords` (array of extracted keywords)
- `isVisible`, `isDeleted`
- `accountCreatedAt`, `indexedAt`

**Update Strategy**: 
- Maintained by `profileSearchIndexJob`
- Must be kept in sync with `Profile` table
- Architecture test enforces: search must read from index, not live `Profile` table
- Uses `upsert` for idempotent updates

### SearchableUser

**Purpose**: Materialized table for base filtering (visibility, deleted status)

**Key Fields**:
- `userId`
- `isVisible`
- `isDeleted`

**Update Strategy**:
- Updated by `profileSearchIndexJob` (same job maintains both tables)
- Updated when profile/user visibility or deletion status changes
- Provides fast base filter for all searches

---

## Performance Considerations

### Materialized Tables

- **ProfileSearchIndex**: Pre-computed searchable fields
- **SearchableUser**: Pre-computed visibility status
- **InterestUserSet**: Pre-computed interest → user mappings
- **InterestSubjectUserSet**: Pre-computed subject → user mappings

### Query Optimization

1. **Base Filter First**: Always starts with `SearchableUser` (small, indexed)
2. **Sparse Block Filtering**: Blocks applied at query time (sparse data)
3. **Index Filters**: Applied directly to `ProfileSearchIndex` WHERE clause
4. **Set Intersection**: User ID filters computed separately, then intersected
5. **Cursor Pagination**: Efficient pagination using indexed fields

### Known Limitations

1. **Trait Filtering**: Requires separate `UserTrait` queries (not in index)
2. **Interest Filtering**: Requires `InterestUserSet` queries
3. **Location**: Text-based only, no distance calculation
4. **Age**: Uses 5-year buckets (not exact age)

---

## Real Risks and Mitigations

### 1. Large userId IN (...) Intersections

**Risk**: Set intersections can explode when:
- Base set is large (many visible users)
- Trait filters are loose (wide value ranges)
- Interest subjects are broad (many matches)

**Current Logic**:
```
baseUserIds ∩ interests ∩ interestSubjects ∩ traits
```

**Mitigations** (Currently Implemented):
- ✅ **Early Exit**: If any intermediate set is empty, return empty results immediately
- ✅ **Set Intersection**: User ID filters computed separately, then intersected once

**Recommended Enhancements**:
1. **Sort by Size**: Intersect smallest sets first to reduce intermediate result size
   ```typescript
   const sets = userIdFilters
     .map(arr => new Set(arr))
     .sort((a, b) => a.size - b.size); // Smallest first
   const intersection = sets.reduce((a, b) => new Set([...a].filter(x => b.has(x))));
   ```

2. **Short-Circuit Aggressively**: Exit early if any set is empty
   ```typescript
   if (filtered.length === 0) {
     where.userId = { in: [] };
     return where; // Already implemented ✅
   }
   ```

### 2. Trait Filtering Cost Scales Non-Linearly

**Risk**: Trait filtering is expensive because:
- Traits are NOT in `ProfileSearchIndex`
- Requires live queries from `UserTrait` table
- Complex grouping + unioning + intersecting operations

**Current Protections**:
- ✅ **Hard Limit**: Maximum 3 traits per query (enforced)
- ✅ **Grouped Processing**: OR within groups, AND between groups

**Performance Impact**:
- Fine at low volume (< 1000 users with traits)
- Becomes slowest path as trait usage grows
- Non-linear scaling: 3 traits = 3 separate queries + set operations

**Hard Rule**: **DO NOT** raise max traits beyond 3 without:
- Indexing traits in `ProfileSearchIndex`, OR
- Caching trait filters, OR
- Materializing trait bitmaps

**Future Optimization** (Optional):
- **TraitBucketJob**: Pre-bucket traits (low/mid/high) for faster filtering
- **Trait Materialization**: Add trait ranges to `ProfileSearchIndex`
- **Trait Caching**: Cache common trait filter combinations

### 3. Age Buckets Cause Edge Bleed

**Risk**: Age buckets can include users slightly outside requested range

**Current Implementation**:
- Uses 5-year buckets: `bucket = floor((age - 18) / 5)`
- Example: `ageMin=25` allows users aged 23-27 (bucket 1 = 23-27)

**UX Impact**:
- Users may see profiles 1-2 years outside their specified range
- Can cause confusion: "I asked for 25+, why is this person 23?"

**Mitigation** (Recommended):
```typescript
// After index filtering, do final exact age check
const filteredProfiles = profiles.filter(profile => {
  const age = calculateAge(profile.birthdate);
  if (ageMin !== undefined && age < ageMin) return false;
  if (ageMax !== undefined && age > ageMax) return false;
  return true;
});
```
- ✅ **Cheap**: In-memory filter on already-small result set
- ✅ **Prevents**: "Why is this person 23?" user reports
- ⚠️ **Trade-off**: Slightly reduces results (may need to over-fetch)

### 4. Location Search Expectation Mismatch

**Risk**: Users assume location search means "near me" / proximity search

**Current Reality**:
- Text-based substring matching only
- "New York" matches "New York, NY", "New York City", "Brooklyn, New York"
- Does NOT filter by distance/radius
- Does NOT use geographic coordinates

**User Expectation**:
- Users expect "New York" ≈ "within X km of New York"
- Users expect distance-based filtering

**Mitigation** (Critical):
- ✅ **UI Labeling**: Frontend MUST label as "Location text" NOT "Near me"
- ✅ **Documentation**: Clearly document text-based search in API docs
- ⚠️ **Future Changes**: If adding true proximity search, version the API
- ⚠️ **Do NOT**: Silently add distance filtering without versioning

**Future Enhancement**:
- Add `radiusKm` parameter for true proximity
- Require `lat`/`lng` in request
- Filter by Haversine distance

### 5. Cursor Stability with Compound Filters

**Risk**: Cursor pagination can be unstable with dynamic intersections

**Current Implementation**:
- ✅ Cursor includes `userId` as tiebreaker
- ✅ Order by includes `userId DESC` (stable sorting)

**Cursor Fields** (Current):
- `newest` sort: `(accountCreatedAt DESC, userId DESC)`
- `age` sort: `(age ASC, userId DESC)`

**Best Practices** (Enforced):
- ✅ **Always Include Tiebreaker**: `userId DESC` in all order by clauses
- ✅ **Cursor Format**: `{ userId: string, sortValue?: number }`
- ⚠️ **Never Mix Sorts**: Don't use age cursor with newest sort (or vice versa)
- ⚠️ **Based on Final ORDER BY**: Cursor must match the actual sort order

**Validation** (Recommended):
- Verify cursor sort matches query sort
- Log cursor/sort mismatches for debugging

### 6. Query Validation Tightening (Minor)

**Current Protections**:
- ✅ `q` max 100 chars (enforced)
- ✅ `location` max 100 chars (enforced)
- ✅ Max 5 interests (enforced)
- ✅ Max 3 traits (enforced)

**Recommended Additions**:
1. **Log Final Result Count**: Help diagnose thin pages
   ```typescript
   console.log('[advanced-search] Results', {
     requested: take,
     returned: responseProfiles.length,
     filters: Object.keys(searchParams).length
   });
   ```

2. **Reject Unfiltered Large Limits**: Prevent "browse all users" abuse
   ```typescript
   if (take > 30 && !hasAnyFilters) {
     return json(res, { error: 'Large limits require filters' }, 400);
   }
   ```
   - ⚠️ **Trade-off**: May block legitimate use cases
   - ✅ **Alternative**: Rate limit instead (already implemented)

---

## Job Structure and Maintenance

### Overview

The search system relies on materialized tables that must be kept up-to-date via background jobs. The job system is structured to handle both batch processing and event-driven updates.

### Core Search Jobs

#### ✅ profile-search-index

**Role**: Core advanced search index maintenance

**Location**: `backend/src/jobs/profileSearchIndexJob.ts`

**Covers**:
- All index-based filters (text, gender, intent, age)
- Age bucket calculation
- Location text parsing (city, state, country)
- Trait summaries (JSON aggregation)
- Top5 keywords extraction
- Visibility and deletion status

**Run Strategy**:
- **Nightly Full**: Rebuild all users (batch mode)
- **Event-Driven**: Single user rebuild on profile changes
- **Initial Setup**: Full population on first run

**Configuration**:
- `userBatchSize`: 100 (default)
- `pauseMs`: 50ms (default)

**Status**: ✅ Essential, correctly implemented

#### ✅ searchable-user

**Role**: Canonical visibility/deletion gate

**Covers**:
- Global eligibility (isVisible, isDeleted)
- Fast base filtering for all searches
- First filter applied everywhere

**Run Strategy**:
- Maintained by `profileSearchIndexJob` (same job)
- Updated on profile/user visibility changes
- Updated on user deletion

**Status**: ✅ Essential, correctly implemented

#### ✅ user-interest-sets

**Role**: Interest AND/OR acceleration

**Covers**:
- `InterestUserSet`: Interest → user mappings (AND logic)
- `InterestSubjectUserSet`: Subject → user mappings (OR logic)

**Run Strategy**:
- **Event-Driven**: On interest change
- **Periodic**: Integrity rebuild (daily/weekly)

**Status**: ✅ Essential for performance

### Job Dependencies

```
profile-search-index
  └─> searchable-user (maintained together)
  
user-interest-sets
  └─> Independent (updates on interest changes)
  
match-scores (recommendations)
  └─> Independent (separate system)
```

### Recommended Job Schedule

**Daily (Must-Run)**:
- `profile-search-index` (full rebuild)
- `user-interest-sets` (integrity check)
- `match-scores` (recommendations)

**Event-Driven**:
- `profile-search-index` (single user on profile change)
- `user-interest-sets` (on interest changes)
- `match-scores` (single user on profile/quiz change)

**Weekly**:
- `stats-reconcile` (counter drift correction)

---

## Missing Jobs (Recommended Additions)

### 🔹 1. LightweightScoreCacheJob (High ROI)

**Why**: 
- Currently computes lightweight scores on-demand for new users
- This job would pre-compute quiz + distance scores

**Benefits**:
- Eliminates cold-start latency
- Pre-warms recommendation fallback path
- Reduces API load for new users

**Implementation**:
- Pre-compute quiz + distance scores for users without `MatchScore` entries
- TTL cache (12-24 hours)
- Run after `match-scores` job completes
- Focus on users created in last 7 days

**Status**: ✅ Recommended addition

### 🔹 2. IndexIntegrityCheckJob (Safety Net)

**Why**: 
- Heavy reliance on materialized tables
- Silent drift is biggest long-term risk

**Checks**:
- Profile exists but no `ProfileSearchIndex` row
- Interest exists but missing in `InterestUserSet`
- Trait exists but missing in trait summary
- User is visible but not in `SearchableUser`

**Run Strategy**:
- Daily during off-peak hours
- Alert-only (log discrepancies, don't auto-fix)
- Can trigger targeted rebuilds

**Status**: ✅ Recommended addition

### 🔹 3. TraitBucketJob (Optional, Future)

**Why**:
- Trait filtering is currently live-query heavy
- Bucketing traits (low/mid/high) enables faster filtering

**Benefits**:
- Faster trait filtering (can use index on buckets)
- Future trait relevance scoring
- Reduces `UserTrait` query cost

**Implementation**:
- Pre-bucket trait values into ranges
- Store in `ProfileSearchIndex` or separate table
- Integrates with `build-user-traits` job

**Status**: ⚠️ Future optimization (not urgent)

---

## Strategic Alignment

### System Architecture Split

| Feature | Data Source | Purpose | Update Strategy |
|---------|-------------|---------|-----------------|
| **Search** | `ProfileSearchIndex` | User intent (explicit filters) | Materialized, job-maintained |
| **Recommendations** | `MatchScore` | System intent (implicit scoring) | Pre-computed, job-maintained |
| **Blocks** | Live sparse tables | Viewer-specific | Query-time filtering |
| **Traits** | Live `UserTrait` table | High-cost, low-volume | Query-time (not indexed) |
| **Interests** | Materialized sets | Medium-cost | Materialized, job-maintained |

**Key Principle**: **Do NOT merge these systems**. Each serves a different purpose:
- Search = user-driven filtering
- Recommendations = algorithm-driven ranking
- Blocks = sparse, viewer-specific
- Traits = expensive, intentionally limited
- Interests = pre-computed for performance

**Current Split is Correct**: ✅ Keep as-is

---

## Error Handling

### Validation Errors (400 Bad Request)

- `q` too short (< 2 characters) or too long (> 100 chars)
- `location` too long (> 100 chars)
- `ageMin > ageMax`
- Invalid `sort` value
- Too many `interests` (> 5)
- Too many `traits` (> 3)
- Invalid `traits` format
- Invalid `limit` (must be 1-50)

### Rate Limiting

- Advanced search endpoint uses `searchRateLimit` middleware
- Prevents abuse of expensive search queries
- Returns 429 Too Many Requests if exceeded

---

## Comparison: Search vs Recommendations

### Search (`/api/profiles/advanced-search`)

- **Purpose**: User-driven filtered search
- **Data Source**: `ProfileSearchIndex` (materialized table)
- **Filtering**: Explicit user filters (gender, intent, age, location, interests, traits)
- **Sorting**: User-controlled (`newest`, `age`)
- **No Job Required**: Reads directly from indexed data
- **No Fallback**: Returns empty if no matches

### Recommendations (`/api/profiles/recommendations`)

- **Purpose**: Personalized recommendations based on compatibility
- **Data Source**: `MatchScore` table (pre-computed scores)
- **Filtering**: Implicit (blocked users, visibility)
- **Sorting**: Score-based (best matches first)
- **Job Required**: `matchScoreJob` must run to generate scores
- **Fallback**: Tiered fallback (7 days → 30 days → unlimited → lightweight scoring)

**Key Difference**: Search is explicit filtering, Recommendations is implicit scoring.

---

## Related Files

- **Handler**: `backend/src/registry/domains/profiles/handlers/search.ts`
- **Query Builder**: `backend/src/services/search/profileSearchQueryBuilder.ts`
- **Loaders**: `backend/src/registry/domains/profiles/loaders/searchLoader.ts`
- **Schema**: `backend/prisma/schema/search.prisma` (ProfileSearchIndex, SearchableUser)
- **Frontend Hook**: `frontend/src/core/profile/search/useProfileSearch.ts`
- **Frontend API**: `frontend/src/api/client.ts` (`advancedSearch`)

---

## Future Enhancements

1. **True Proximity Search**: Add distance-based location filtering with lat/lng
2. **Trait Scoring**: Weight trait matches by importance/relevance
3. **Search Relevance**: Rank results by relevance (beyond simple filters)
4. **Full-Text Search**: Upgrade to PostgreSQL full-text search for better text matching
5. **Search Analytics**: Track popular searches and filter combinations
6. **Saved Searches**: Allow users to save and reuse search queries
