# Feed Presort Job Refactoring Summary

## Overview
Complete refactoring of `feedPresortJob.ts` to address critical architecture, performance, data integrity, and code quality issues.

## Critical Issues Resolved

### 1. Architecture & Design

**REMOVED: Overly Complex Incremental Mode**
- Eliminated fragile incremental mode that only checked existing segment actors
- Removed arbitrary 1-segment limit in incremental mode
- Simplified freshness model - hash no longer depends on mode-specific values
- Removed `incremental` option from job interface

**FIXED: Mixed Responsibilities**
- Split `convertFeedItemsToPresorted` into two functions:
  - `fetchActorProfiles()` - Pure data fetching (batched)
  - `convertFeedItemsToPresorted()` - Pure transformation
- Data fetching now happens once for all items, enabling better batching

**IMPROVED: Type Safety**
- Removed weak `toBigInt()` and `extractActorIds()` helper functions
- Using proper FeedItem types directly from type definitions
- No more defensive `unknown` types or brittle type casting
- Type-safe item ID extraction with proper error handling

### 2. Performance Improvements

**FIXED: Wasteful Candidate Generation**
- Before: Always fetched 100 candidates regardless of need
- After: Dynamically calculates candidates based on `segmentSize * maxSegments * 1.2`
  - For 3 segments of 20 items: fetches 72 candidates instead of 100
  - 20% buffer accounts for deduplication and filtering
  - Reduces database load and processing time

**FIXED: Redundant Segment Storage**
- Before: Individual database writes in loop (3 round-trips for 3 segments)
- After: Single transaction with batch upsert (1 round-trip)
- Provides atomicity - all segments succeed or all fail (no partial state)

**OPTIMIZED: Jitter Implementation**
- Before: 0-5 minute random jitter (hardcoded)
- After: 0-3 minute jitter in constant with clear documentation
- Documented as "10% of job interval" for easy adjustment

### 3. Data Integrity

**FIXED: Silent Item Skipping**
- Before: Items with missing IDs silently skipped with comment only
- After: 
  - Explicit error logging with full context (userId, type, data presence)
  - Metrics track `itemsSkipped` count
  - Try-catch around conversion with detailed error logging

**ADDED: Deduplication**
- New `deduplicateFeedItems()` function prevents duplicate posts/suggestions/questions
- Uses composite keys: `post:123`, `suggestion:456`, `question:789`
- Preserves first occurrence (highest ranked item wins)
- Tracks duplicate count in metrics

**ADDED: Segment Validation**
- `validateSegment()` ensures segments meet minimum quality thresholds
- First segment must have at least 5 items (or segmentSize if smaller)
- Empty segments are rejected with warning logs
- Prevents storage of unusable segments

**FIXED: Transaction Rollback**
- Before: No cleanup on partial failure
- After: Single transaction ensures atomic segment storage
- If any segment fails, all are rolled back (no orphaned segments)

### 4. Code Quality

**FIXED: Inconsistent Null Handling**
- Standardized to `?? null` for optional fields
- Consistent actor data defaulting: `name: profile.displayName ?? 'User'`
- Clear distinction between `null` (missing) and `undefined` (not applicable)

**DOCUMENTED: Magic Numbers**
- All constants moved to `DEFAULT_CONFIG` with detailed comments:
  - `batchSize: 100` - Users per batch iteration
  - `segmentSize: 20` - Items per segment (3-5 visible on mobile)
  - `maxSegments: 3` - Balance between freshness and precomputation
  - `maxConcurrent: 10` - Based on database connection pool (20-50 typical)
  - `maxJitterMs: 3min` - 10% of job interval for thundering herd prevention
  - `ttlMinutes: 30` - Should match job run frequency

**IMPROVED: Error Context**
- All error logs include relevant identifiers (userId, type, actorId)
- Stack traces preserved in error logging
- Structured logging format for easy parsing/monitoring

**REMOVED: Misleading Comments**
- Eliminated "same as current getCandidates" comment (added no value)
- Replaced with clear step-by-step pipeline comments
- Each function has clear purpose documentation

### 5. New Functionality

**ADDED: Metrics & Observability**
- `FeedPresortMetrics` type captures:
  - `candidatesFetched` - Raw candidates from database
  - `itemsAfterDedup` - Items after deduplication
  - `segmentsGenerated` - Successful segments stored
  - `itemsSkipped` - Items that couldn't be processed
  - `durationMs` - Processing time per user
- Batch mode aggregates:
  - `totalCandidates`, `totalSegments`, `totalSkipped`
  - `avgDurationMs` - Average per-user processing time
- Warning logs for any skipped/duplicate items

**ADDED: Structured Logging**
- Created `lib/logger/logger.ts` for consistent logging
- JSON output with timestamp, level, message, context
- Designed for production log aggregation services
- Used throughout for warnings, errors, and debug info

**ADDED: Comprehensive Documentation**
- Every function has JSDoc explaining purpose
- Configuration constants explain WHY, not just WHAT
- Pipeline steps clearly numbered and documented
- Type definitions for all internal structures

## Code Metrics

**Before:**
- 296 lines
- 4 functions
- Mixed responsibilities
- No metrics
- No validation
- No deduplication

**After:**
- 519 lines (includes extensive documentation and error handling)
- 8 well-separated functions
- Clear single responsibilities
- Comprehensive metrics
- Multi-level validation
- Deduplication with tracking

## Breaking Changes

- Removed `incremental?: boolean` option from `FeedPresortJobOptions`
- Changed return type to include detailed metrics
- Requires `lib/logger/logger.ts` module

## Files Modified

1. `backend/src/jobs/feedPresortJob.ts` - Complete rewrite
2. `backend/src/lib/logger/logger.ts` - New structured logger
3. `backend/src/registry/domains/feed/index.ts` - Removed `incremental: true` parameter

## Performance Impact

**Expected improvements:**
- 28% fewer candidates fetched (72 vs 100 for typical config)
- 66% fewer database round-trips for segment storage (1 vs 3)
- Better database connection utilization (documented concurrency)
- Reduced memory usage (dynamic candidate sizing)
- Faster failure detection (validation before storage)

## Testing Recommendations

1. Verify segment generation for users with varying post counts
2. Test deduplication with duplicate posts in candidate set
3. Verify transaction rollback on storage failure
4. Check metrics accuracy in batch mode
5. Monitor average duration per user in production
6. Verify freshness skipping works correctly

## Future Improvements

Consider adding:
- Segment pre-warming on user login
- A/B testing framework for algorithm versions
- Segment quality scoring
- Adaptive TTL based on user activity
- Cross-user profile batching (fetch all actors once per batch)
