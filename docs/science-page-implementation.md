# Science Page - Data Visualization Implementation

## Overview

The Science page (`/science`) is an internal analytics dashboard that visualizes matching algorithm insights, user compatibility patterns, and interest correlations. This feature helps us understand and improve our matching algorithms by exploring precalculated job analyses.

## Core Principles

1. **Views for Explanations**: Derive pair-level insights from existing data via SQL views
2. **Jobs for Aggregates Only**: Precalculate distributions, trends, and sampling - not explanations
3. **Illustrative, Not Authoritative**: Science page is experimental, replaceable, never a production dependency
4. **Materialize Only When Forced**: Start with views, materialize only if performance demands it
5. **Minimize Schema Churn**: Leverage existing tables, avoid duplicating source of truth

## Data Requirements

### Primary Visualizations

1. **Match Quality Spectrum**
   - Best to worst matched user pairs
   - Detailed breakdown of compatibility factors
   - Score contribution analysis (quiz, interests, proximity, etc.)

2. **Interest Analysis**
   - Most popular interests across the platform
   - Interest correlation matrix (which interests commonly co-occur)
   - Interest-based match success rates

3. **Compatibility Insights**
   - Quiz dimension distributions
   - Common compatibility patterns
   - Anti-patterns (what causes poor matches)

4. **Platform Statistics**
   - Match score distribution histogram
   - Connection success rates by match tier
   - Temporal trends

## Database Schema

### Strategy: Views First, Tables Only for Aggregates

**Pair-level data** → SQL views (derived from existing tables)  
**Aggregate statistics** → Tables (precalculated by jobs)

### Views (No Storage Cost)

#### `v_match_explainer`
Derives detailed match explanations from existing data.

```sql
CREATE VIEW v_match_explainer AS
SELECT 
  ms.user1_id,
  ms.user2_id,
  ms.score as match_score,
  ms.score_breakdown,
  ms.created_at as scored_at,
  
  -- User info
  u1.username as user1_name,
  u2.username as user2_name,
  
  -- Shared interests (computed live)
  ARRAY_AGG(DISTINCT i.id ORDER BY i.id) FILTER (
    WHERE ui1.interest_id = ui2.interest_id
  ) as shared_interest_ids,
  ARRAY_AGG(DISTINCT i.name ORDER BY i.id) FILTER (
    WHERE ui1.interest_id = ui2.interest_id
  ) as shared_interest_names,
  COUNT(DISTINCT i.id) FILTER (
    WHERE ui1.interest_id = ui2.interest_id
  ) as shared_interest_count,
  
  -- Connection status (if exists)
  c.id IS NOT NULL as is_connected,
  c.status as connection_status,
  c.created_at as connected_at
  
FROM match_scores ms
JOIN users u1 ON ms.user1_id = u1.id
JOIN users u2 ON ms.user2_id = u2.id
LEFT JOIN user_interests ui1 ON ui1.user_id = u1.id
LEFT JOIN user_interests ui2 ON ui2.user_id = u2.id
LEFT JOIN interests i ON i.id = ui1.interest_id AND ui1.interest_id = ui2.interest_id
LEFT JOIN connections c ON (
  (c.user1_id = ms.user1_id AND c.user2_id = ms.user2_id) OR
  (c.user1_id = ms.user2_id AND c.user2_id = ms.user1_id)
)
GROUP BY 
  ms.user1_id, ms.user2_id, ms.score, ms.score_breakdown, ms.created_at,
  u1.username, u2.username, c.id, c.status, c.created_at;
```

**Usage**: Query this view with `ORDER BY match_score DESC LIMIT 100` for best matches, or `ASC` for worst matches.

#### `v_interest_popularity`
Live interest statistics from existing data.

```sql
CREATE VIEW v_interest_popularity AS
SELECT 
  i.id as interest_id,
  i.name as interest_name,
  COUNT(DISTINCT ui.user_id) as total_users,
  ROUND(100.0 * COUNT(DISTINCT ui.user_id) / NULLIF((SELECT COUNT(*) FROM users WHERE active = true), 0), 2) as percentage
FROM interests i
LEFT JOIN user_interests ui ON ui.interest_id = i.id
GROUP BY i.id, i.name
ORDER BY total_users DESC;
```

### Aggregate Tables (Jobs Populate These)

#### `science_interest_correlations`
Precalculated interest correlation matrix.

```sql
CREATE TABLE science_interest_correlations (
  interest_a_id INTEGER NOT NULL REFERENCES interests(id),
  interest_b_id INTEGER NOT NULL REFERENCES interests(id),
  
  -- Correlation metrics
  shared_user_count INTEGER NOT NULL,
  correlation_score DECIMAL(5,2), -- Jaccard index or similar
  avg_match_score DECIMAL(5,2),   -- Avg match score for users sharing both interests
  
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  PRIMARY KEY (interest_a_id, interest_b_id),
  CHECK (interest_a_id < interest_b_id) -- Prevent duplicates
);

CREATE INDEX idx_science_correlations_score ON science_interest_correlations(correlation_score DESC);
```

#### `science_daily_stats`
Daily platform-wide aggregates.

```sql
CREATE TABLE science_daily_stats (
  stat_date DATE PRIMARY KEY,
  
  -- Match score distribution (histogram buckets)
  score_dist_0_20 INTEGER DEFAULT 0,
  score_dist_20_40 INTEGER DEFAULT 0,
  score_dist_40_60 INTEGER DEFAULT 0,
  score_dist_60_80 INTEGER DEFAULT 0,
  score_dist_80_100 INTEGER DEFAULT 0,
  
  avg_match_score DECIMAL(5,2),
  median_match_score DECIMAL(5,2),
  total_match_pairs INTEGER,
  
  -- Connection metrics
  total_connections INTEGER,
  connection_rate DECIMAL(5,2), -- Percentage
  avg_days_to_connect DECIMAL(5,2),
  
  -- Interest metrics
  avg_interests_per_user DECIMAL(5,2),
  most_popular_interests JSONB, -- [{id, name, count}] top 20
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_science_daily_stats_date ON science_daily_stats(stat_date DESC);
```

#### `science_sample_pairs`
Lightweight sampling table - just IDs for UI to query against views.

```sql
CREATE TABLE science_sample_pairs (
  id SERIAL PRIMARY KEY,
  user1_id INTEGER NOT NULL REFERENCES users(id),
  user2_id INTEGER NOT NULL REFERENCES users(id),
  match_score DECIMAL(5,2) NOT NULL,
  sample_category VARCHAR(20) NOT NULL, -- 'best', 'worst', 'middle'
  sampled_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(user1_id, user2_id)
);

CREATE INDEX idx_science_sample_category ON science_sample_pairs(sample_category, match_score DESC);
```

**Why this table?** Jobs sample representative pairs, store only IDs + score. UI queries IDs from here, then joins to `v_match_explainer` for fresh explanations.

## Jobs System

### Job Philosophy

Jobs do **aggregation and sampling**, NOT explanation.
- ✅ Calculate distributions, histograms, correlations
- ✅ Sample representative pairs (store IDs only)
- ❌ Don't store explanations (use views instead)
- ❌ Don't duplicate source of truth

### New Jobs

#### `science-sample-pairs`
**Purpose**: Sample representative match pairs across quality spectrum.

**What it does**:
- Query `match_scores` for top 100 best matches
- Query for 100 random middle-range matches (score 40-60)
- Query for bottom 100 worst matches
- Store only `(user1_id, user2_id, match_score, category)` in `science_sample_pairs`

**What it doesn't do**:
- ❌ Calculate breakdowns (views handle this)
- ❌ Store shared interests (views compute live)
- ❌ Store quiz comparisons (views compute live)

**Frequency**: Daily at 2 AM

**Output**: Populates `science_sample_pairs` (~300 rows)

**Dependencies**: Requires `calculate-match-scores` to run first

```typescript
{
  name: 'science-sample-pairs',
  schedule: '0 2 * * *',
  handler: async (job) => {
    // TRUNCATE science_sample_pairs
    // INSERT best 100: SELECT ... ORDER BY score DESC LIMIT 100
    // INSERT middle 100: SELECT ... WHERE score BETWEEN 40 AND 60 ORDER BY RANDOM() LIMIT 100
    // INSERT worst 100: SELECT ... ORDER BY score ASC LIMIT 100
  }
}
```

#### `science-interest-correlations`
**Purpose**: Calculate interest co-occurrence and correlation matrix.

**What it does**:
- For each pair of interests (i, j):
  - Count users who have both
  - Calculate Jaccard similarity: |users_with_both| / |users_with_i ∪ users_with_j|
  - Calculate avg match score for users sharing both interests
- Store in `science_interest_correlations`

**Frequency**: Daily at 3 AM

**Output**: Populates `science_interest_correlations` (N×N/2 rows where N = number of interests)

#### `science-daily-stats`
**Purpose**: Calculate platform-wide daily aggregates.

**What it does**:
- Count match score distribution buckets
- Calculate avg/median match scores
- Count connections, calculate rates
- Calculate avg interests per user
- Identify top 20 most popular interests
- Store in `science_daily_stats`

**Frequency**: Daily at 1 AM

**Output**: Adds 1 row to `science_daily_stats` per day

### Job Group

```typescript
{
  name: 'science-analytics',
  description: 'Science page aggregate calculations',
  jobs: [
    'science-daily-stats',       // 1 AM - platform aggregates
    'science-sample-pairs',       // 2 AM - sample representative pairs
    'science-interest-correlations' // 3 AM - interest correlation matrix
  ],
  dependencies: ['match-scoring'] // Runs after match scoring completes
}
```

## API Design

### Data Flow

1. **Pair Explanations**: Query `science_sample_pairs` for IDs → Join to `v_match_explainer` view
2. **Aggregates**: Query aggregate tables directly (`science_daily_stats`, `science_interest_correlations`)
3. **Live Stats**: Query views directly (`v_interest_popularity`)

### Endpoints

#### `GET /api/science/match-spectrum`
Returns sampled match pairs with live-computed explanations.

**Query Parameters**:
- `range`: 'best' | 'worst' | 'middle' | 'all'
- `limit`: number (default 50, max 100)
- `offset`: number (default 0)

**Implementation**:
```sql
-- Step 1: Get sampled pair IDs
SELECT user1_id, user2_id FROM science_sample_pairs 
WHERE sample_category = $range 
ORDER BY match_score DESC 
LIMIT $limit OFFSET $offset;

-- Step 2: Join to view for live explanations
SELECT * FROM v_match_explainer
WHERE (user1_id, user2_id) IN (result_from_step_1);
```

**Response**:
```typescript
{
  pairs: Array<{
    user1: { id: number; username: string };
    user2: { id: number; username: string };
    matchScore: number;
    scoreBreakdown: {
      quiz: number;
      interests: number;
      proximity: number;
      activity: number;
    };
    sharedInterests: Array<{ id: number; name: string }>;
    sharedInterestCount: number;
    isConnected: boolean;
    connectionStatus?: string;
    scoredAt: string;
  }>;
  total: number;
  sampledAt: string; // When sample_pairs job last ran
}
```

#### `GET /api/science/interests`
Returns interest popularity and correlations.

**Query Parameters**:
- `sortBy`: 'popularity' | 'name' (default: 'popularity')
- `limit`: number (default 100, max 500)
- `withCorrelations`: boolean (default: false) - include top correlations

**Implementation**:
```sql
-- Base query from view
SELECT * FROM v_interest_popularity
ORDER BY total_users DESC
LIMIT $limit;

-- If withCorrelations=true, join to aggregate table
LEFT JOIN (
  SELECT interest_a_id, 
         JSON_AGG(JSON_BUILD_OBJECT(
           'interestId', interest_b_id,
           'correlationScore', correlation_score,
           'sharedUsers', shared_user_count
         ) ORDER BY correlation_score DESC) as correlations
  FROM (
    SELECT * FROM science_interest_correlations
    WHERE interest_a_id = $interestId
    ORDER BY correlation_score DESC
    LIMIT 10
  ) sub
  GROUP BY interest_a_id
) corr ON corr.interest_a_id = i.id;
```

**Response**:
```typescript
{
  interests: Array<{
    id: number;
    name: string;
    totalUsers: number;
    percentage: number;
    correlations?: Array<{  // Only if withCorrelations=true
      interestId: number;
      correlationScore: number;
      sharedUsers: number;
    }>;
  }>;
  updatedAt: string; // When correlations job last ran
}
```

#### `GET /api/science/stats`
Returns platform-wide daily statistics.

**Query Parameters**:
- `days`: number (default 30, max 365)

**Implementation**:
```sql
SELECT * FROM science_daily_stats
WHERE stat_date >= CURRENT_DATE - INTERVAL '$days days'
ORDER BY stat_date DESC;
```

**Response**:
```typescript
{
  stats: Array<{
    date: string;
    matchScoreDistribution: {
      '0-20': number;
      '20-40': number;
      '40-60': number;
      '60-80': number;
      '80-100': number;
    };
    avgMatchScore: number;
    medianMatchScore: number;
    totalMatchPairs: number;
    totalConnections: number;
    connectionRate: number;
    avgDaysToConnect: number;
    avgInterestsPerUser: number;
    mostPopularInterests: Array<{
      id: number;
      name: string;
      count: number;
    }>;
  }>;
}
```

### Backend Structure

```
backend/src/registry/domains/science/
  index.ts              # Domain registration
  handlers/
    spectrum.ts         # GET /api/science/match-spectrum (queries samples + views)
    interests.ts        # GET /api/science/interests (queries view + correlations table)
    stats.ts            # GET /api/science/stats (queries daily stats table)
  views.ts              # SQL view definitions and query builders
  types.ts              # TypeScript types

backend/scripts/jobs/science/
  sample-pairs.ts       # Samples representative match pairs
  interest-correlations.ts  # Calculates interest correlation matrix
  daily-stats.ts        # Aggregates daily platform statistics
```

**Key Point**: Handlers mostly query views, not materialized data. Jobs only populate lightweight aggregate tables.

## Frontend Implementation

### Route Setup

Add to `frontend/src/core/routing/routes.tsx`:

```typescript
{
  path: '/science',
  element: <ProtectedRoute><SciencePage /></ProtectedRoute>,
  meta: {
    title: 'Science - Match Insights',
    description: 'Algorithm insights and platform analytics'
  }
}
```

### Component Structure

```
frontend/src/ui/science/
  SciencePage.tsx                    # Main page container
  components/
    MatchSpectrumView.tsx            # Best/worst matches list
    MatchPairDetail.tsx              # Individual pair breakdown
    InterestCorrelationChart.tsx     # Interest network/matrix
    InterestStatsTable.tsx           # Interest statistics table
    QuizDimensionChart.tsx           # Quiz distribution charts
    PlatformStatsOverview.tsx        # Platform-wide metrics
    ScoreBreakdownBar.tsx            # Visual score breakdown
    CompatibilityFactorCard.tsx      # Individual factor card
  hooks/
    useScienceData.ts                # Data fetching hook
    useMatchSpectrum.ts              # Match pairs hook
    useInterestAnalysis.ts           # Interest stats hook
  types.ts
```

### Data Fetching

```typescript
// frontend/src/api/science.ts
export const scienceApi = {
  getMatchSpectrum: (params: MatchSpectrumParams) =>
    client.get('/api/science/match-spectrum', { params }),
  
  getInterestStats: (params: InterestStatsParams) =>
    client.get('/api/science/interest-stats', { params }),
  
  getQuizInsights: () =>
    client.get('/api/science/quiz-insights'),
  
  getPlatformStats: (days: number = 30) =>
    client.get('/api/science/platform-stats', { params: { days } })
};
```

### UI Layout

```
┌─────────────────────────────────────────────────────────┐
│ Science - Match Insights                                │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  📊 Platform Overview                                   │
│  ┌──────────┬──────────┬──────────┬──────────┐         │
│  │ Avg Match│ Total    │ Active   │ Connection│         │
│  │ Score    │ Users    │ Interests│ Rate      │         │
│  │  67.3    │  12,450  │  1,247   │  23.4%    │         │
│  └──────────┴──────────┴──────────┴──────────┘         │
│                                                          │
│  🔬 Match Quality Spectrum                              │
│  [ Best Matches | Middle | Worst Matches ]              │
│  ┌─────────────────────────────────────────┐            │
│  │ 👤 Alice & Bob                   98.5  ✓│            │
│  │ ├─ Quiz: 45.2  ██████████                │            │
│  │ ├─ Interests: 38.1  ████████              │            │
│  │ ├─ Proximity: 10.2  ██                    │            │
│  │ └─ Activity: 5.0  █                       │            │
│  │ Shared: hiking, photography, coffee       │            │
│  │ Connection: Matched 2 weeks ago          │            │
│  ├─────────────────────────────────────────┤            │
│  │ 👤 Charlie & Dana                87.3  ✗│            │
│  │ ...                                      │            │
│  └─────────────────────────────────────────┘            │
│                                                          │
│  📈 Interest Analysis                                   │
│  ┌──────────────┬──────┬────────┬──────────┐           │
│  │ Interest     │ Users│ Avg    │ Correlated│           │
│  │              │      │ Match  │ With      │           │
│  ├──────────────┼──────┼────────┼──────────┤           │
│  │ Hiking       │ 3,421│ 71.2   │ Travel...│           │
│  │ Photography  │ 2,890│ 69.8   │ Art...   │           │
│  │ ...          │      │        │          │           │
│  └──────────────┴──────┴────────┴──────────┘           │
│                                                          │
│  🧪 Quiz Dimension Insights                             │
│  [Distribution charts for each dimension]               │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Visualization Libraries

Recommended: **Recharts** (already used in admin)

```typescript
import {
  BarChart, Bar, LineChart, Line, ScatterPlot,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts';
```

Alternative: **Chart.js** via react-chartjs-2

## Styling

Use existing design system:

```css
/* frontend/src/styles/components/science/index.css */
.science-page {
  padding: var(--spacing-lg);
  max-width: 1400px;
  margin: 0 auto;
}

.science-section {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-lg);
}

.match-pair-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.match-pair-card.best {
  border-left: 4px solid var(--color-success);
}

.match-pair-card.worst {
  border-left: 4px solid var(--color-error);
}

.score-breakdown {
  display: grid;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
}

.score-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.score-bar-fill {
  height: 20px;
  background: var(--color-primary);
  border-radius: var(--radius-sm);
  transition: width 0.3s ease;
}
```

## Why This Approach Wins

### vs. Materializing Everything

| Concern | Materialized Tables | Views + Light Aggregates |
|---------|-------------------|-------------------------|
| **Schema Churn** | High - explanations change often | Low - views adapt automatically |
| **Staleness** | Constant fight | Only aggregates can be stale |
| **Source of Truth** | Duplicates match_scores, user_interests | Derives from source tables |
| **Storage Cost** | High - N×N pair explanations | Low - ~300 sample IDs + aggregates |
| **Query Freshness** | As fresh as last job run | Always fresh (views) |
| **Maintenance** | Jobs must update explanations | Jobs only update aggregates |
| **Risk** | Breaking production queries | Isolated, replaceable |

### Philosophy

**Science page is not production** - It's an internal exploration tool. If a query is slow, we optimize the view or add an index. Only materialize when performance forces it, and only after patterns stabilize.

**Jobs aggregate, views explain** - Jobs calculate distributions and correlations (stable metrics). Views derive pair-level explanations (fluid logic).

**Replaceable by design** - If we want to change what "compatibility" means, we update a view, not migrate millions of rows.

## Implementation Phases

### Phase 1: Views & Sampling (Week 1)
- [ ] Create `v_match_explainer` view
- [ ] Create `v_interest_popularity` view  
- [ ] Create `science_sample_pairs` table + migration
- [ ] Implement `science-sample-pairs` job
- [ ] Verify views return correct data

### Phase 2: Match Spectrum API & UI (Week 2)
- [ ] Create `/api/science/match-spectrum` endpoint (queries samples + view)
- [ ] Build frontend route `/science`
- [ ] Create `MatchSpectrumView` component
- [ ] Display best/worst match pairs with live explanations
- [ ] Add score breakdown visualization

### Phase 3: Aggregates & Stats (Week 3)
- [ ] Create `science_daily_stats` table + migration
- [ ] Implement `science-daily-stats` job
- [ ] Create `/api/science/stats` endpoint
- [ ] Build platform overview dashboard UI
- [ ] Add match score distribution chart

### Phase 4: Interest Correlations (Week 4)
- [ ] Create `science_interest_correlations` table + migration
- [ ] Implement `science-interest-correlations` job
- [ ] Create `/api/science/interests` endpoint
- [ ] Build interest analysis UI
- [ ] Add correlation matrix/network visualization

### Phase 5: Polish & Performance (Week 5)
- [ ] Add indexes to views for performance
- [ ] Implement caching on API responses (1 hour)
- [ ] Add loading states and error handling
- [ ] Mobile-responsive layout
- [ ] Performance testing (<2s page load)

## Security Considerations

### Access Control

This page should be **admin-only** or **internal-only**.

```typescript
// Option 1: Admin-only
<ProtectedRoute requiredRole="admin">
  <SciencePage />
</ProtectedRoute>

// Option 2: Feature flag
<ProtectedRoute>
  {user.hasFeature('science_page') && <SciencePage />}
</ProtectedRoute>
```

### Data Privacy

- **Anonymization**: Consider showing user IDs instead of names/usernames
- **Aggregation**: Most views should show aggregate data
- **PII Protection**: Avoid exposing sensitive personal data
- **Audit Logging**: Log who accesses this sensitive data

## Performance Considerations

### View Optimization

Views compute on-demand, so indexes on source tables matter:

```sql
-- Ensure these exist
CREATE INDEX IF NOT EXISTS idx_match_scores_score ON match_scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_match_scores_users ON match_scores(user1_id, user2_id);
CREATE INDEX IF NOT EXISTS idx_user_interests_user ON user_interests(user_id, interest_id);
CREATE INDEX IF NOT EXISTS idx_connections_users ON connections(user1_id, user2_id);
```

### Caching Strategy

1. **API Response Caching**: Cache `/api/science/*` responses for 1 hour (Redis or in-memory)
2. **Sample Table**: Refreshed daily, so queries are fast (~300 rows)
3. **Aggregate Tables**: Small tables, fast queries
4. **View Queries**: Limited to sampled pairs (max 100 per request), not full table scans

### Query Limits

1. **Match Spectrum**: Max 100 pairs per request (paginated)
2. **Interests**: Max 500 interests per request
3. **Stats**: Max 365 days of history

### When to Materialize

Only materialize if:
- View queries consistently exceed 2 seconds
- EXPLAIN ANALYZE shows unavoidable full table scans
- Caching doesn't solve the problem

Then materialize **only that specific view**, not everything.

## Testing Strategy

### Backend Tests
- Unit tests for calculation logic
- Integration tests for API endpoints
- Job execution tests with sample data

### Frontend Tests
- Component rendering tests
- Data fetching hook tests
- Visualization component tests
- E2E test for main user flow

### Data Quality Tests
- Validate calculated statistics
- Check for data freshness
- Monitor job execution success rates

## Future Enhancements

1. **Real-time Updates**: WebSocket updates when new data is calculated
2. **Drill-down Analysis**: Click to explore specific patterns
3. **A/B Testing Integration**: Compare algorithm variations
4. **Prediction Models**: ML-based match success prediction
5. **Export Reports**: Generate PDF reports
6. **Historical Trends**: Track metrics over time
7. **Custom Queries**: Allow admins to run custom analyses
8. **Match Simulation**: Test how specific profile changes affect matches

## Open Questions

1. **Sample Size**: 300 pairs total (100 best, 100 middle, 100 worst) enough?
2. **User Privacy**: Show real usernames or anonymize? (Recommend: show real names, admin-only access)
3. **Access Level**: Admin-only or broader internal team? (Recommend: admin-only initially)
4. **Aggregate Retention**: Keep daily stats forever or archive after 1 year?
5. **View Performance**: If views are slow, which to materialize first?
6. **Correlation Threshold**: Only store interest correlations above what score? (Recommend: >0.1)

## Success Metrics

- Page loads in <2 seconds
- All visualizations render within 500ms
- Jobs complete within 1 hour window
- Data freshness: <24 hours old
- Zero PII leaks
- 100% of admins find insights valuable

## Key Architectural Decisions

### ✅ What We're Doing

1. **SQL Views for Explanations**
   - `v_match_explainer` - Derives pair-level insights from match_scores, user_interests, connections
   - `v_interest_popularity` - Live interest statistics from existing data
   - Always fresh, adapts automatically to schema changes

2. **Lightweight Sampling**
   - `science_sample_pairs` stores only IDs + score (~300 rows)
   - Job samples representative pairs across quality spectrum
   - UI queries samples, then joins to views for fresh explanations

3. **Jobs Only for Aggregates**
   - Daily platform statistics (distributions, averages, top-N lists)
   - Interest correlation matrix (N×N/2 rows)
   - NOT storing individual pair breakdowns

4. **Replaceable by Design**
   - Science page is experimental, not a production dependency
   - If a view is slow, optimize or materialize that specific view
   - Easy to delete entire feature without affecting core system

### ❌ What We're NOT Doing

1. ❌ Materializing pair-level explanations in tables
2. ❌ Duplicating source of truth from match_scores/user_interests
3. ❌ Storing quiz dimension breakdowns (compute from views)
4. ❌ Storing shared interests (compute from views)
5. ❌ Jobs calculating explanations (only aggregates)

### Trade-offs Accepted

**Pros**:
- Low storage cost
- Always fresh explanations
- No schema churn
- Easy to change/remove
- No staleness issues

**Cons**:
- Views compute on-demand (mitigated by: indexes, caching, small sample size)
- Can't show explanations for millions of pairs (we sample instead)

**Mitigation**: If performance becomes an issue, materialize the specific slow view, not everything.

## References

- Existing job system: `backend/scripts/jobs/README.md`
- Match scoring: `docs/match-score-job.md`
- Admin interface: `docs/admin-interface-plan.md`
- Database schema: `backend/prisma/schema.prisma`
