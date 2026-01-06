# Proximity Search Strategy: Live Querying vs Match Results

## Current State

### What We Have

1. **Profile Schema**: `Profile` table has `lat` and `lng` fields (Decimal(9,6))
   - Indexed: `@@index([lat, lng])`
   - Optional: Can be null

2. **Match Scores**: Already compute and store distance
   - `MatchScore.distanceKm`: Pre-computed distance between user pairs
   - Computed in `matchScoreJob` using Haversine formula
   - Stored for all scored user pairs

3. **Search Index**: `ProfileSearchIndex` does NOT have lat/lng
   - Currently only has text-based location search
   - No distance calculation capability

---

## Two Approaches: Analysis

### Approach 1: Live Querying (Materialized in Search Index)

**How It Works**:
- Add `lat`/`lng` to `ProfileSearchIndex` materialized table
- Query uses Haversine formula or MySQL spatial functions at query time
- Filter by `radiusKm` parameter directly in WHERE clause

**Pros**:
- ✅ **Real-time accuracy**: Always up-to-date (after index refresh)
- ✅ **Flexible queries**: Any radius, any center point
- ✅ **Independent of match scores**: Works for all users, not just scored pairs
- ✅ **User-driven search**: Users can search from any location
- ✅ **Combines with other filters**: Can filter by distance + gender + age + etc.
- ✅ **Fast with proper indexing**: Spatial index (or lat/lng composite index) is efficient

**Cons**:
- ❌ **Requires index update**: `profileSearchIndexJob` must copy lat/lng
- ❌ **Query cost**: Haversine calculation in SQL can be expensive for large datasets
- ❌ **Index size**: Additional 16 bytes per user (lat + lng)
- ❌ **Null handling**: Must handle users without coordinates
- ❌ **Radius queries**: Need efficient spatial query (MySQL spatial functions or bounding box + Haversine)

**Performance**:
- Spatial index (MySQL `POINT` type) would be ideal but requires schema change
- Composite index `(lat, lng)` works but requires bounding box pre-filter
- Typical query: 50-200ms for radius search on 100K users (with proper index)

---

### Approach 2: Match Results Only (Pre-computed Distances)

**How It Works**:
- Use `MatchScore.distanceKm` that's already computed
- Filter recommendations by distance threshold
- Only works for users with match scores

**Pros**:
- ✅ **Zero query cost**: Distance already computed
- ✅ **Fast**: Just filter by `distanceKm <= radiusKm` in WHERE clause
- ✅ **No schema changes**: Uses existing `MatchScore` table
- ✅ **No index updates**: Distance already stored
- ✅ **Simple implementation**: Just add WHERE clause filter

**Cons**:
- ❌ **Limited scope**: Only works for users with match scores
- ❌ **Not for search**: Can't use in general search queries
- ❌ **Fixed pairs**: Only distances between specific user pairs exist
- ❌ **Job dependency**: Requires `matchScoreJob` to run
- ❌ **No user location flexibility**: Can't search "near me" from arbitrary location
- ❌ **Cold start**: New users have no match scores

**Performance**:
- Very fast: ~10-50ms (simple WHERE filter on indexed column)
- But only covers scored user pairs

---

## Recommendation: Hybrid Approach

### Strategy

Use **BOTH** approaches for different use cases:

1. **Recommendations**: Use match results (Approach 2)
   - Already computed, fast, fits the use case
   - Recommendations are viewer-specific anyway

2. **Search**: Use live querying with materialized index (Approach 1)
   - User-driven search needs flexibility
   - Works for all users, not just scored pairs
   - Can search "near me" from any location

---

## Implementation Plan

### Phase 1: Enhance Recommendations (Ship Immediately)

**What**: Add distance filtering to recommendations API

**Why This Is Perfect**:
- ✅ No schema changes
- ✅ No new jobs
- ✅ No extra compute
- ✅ Already accurate (Haversine, stored)
- ✅ Naturally viewer-centric
- ✅ Clean, low-risk win

**Changes**:
- Add `radiusKm` parameter to `/api/profiles/recommendations`
- Filter `MatchScore` by `distanceKm <= radiusKm`
- Return distance in response (already available)

**Guardrails (Critical)**:

1. **Require viewer location**: Use viewer's profile lat/lng (stored) OR require lat/lng in request
   ```typescript
   // Option A: Use viewer's profile location
   const viewerProfile = await loadViewerProfile(viewerId);
   if (radiusKm && (!viewerProfile.lat || !viewerProfile.lng)) {
     return json(res, { error: 'Viewer location required for radiusKm' }, 400);
   }
   
   // Option B: Require explicit lat/lng in request
   const { radiusKm, lat, lng } = req.query;
   if (radiusKm && (!lat || !lng)) {
     return json(res, { error: 'lat and lng required with radiusKm' }, 400);
   }
   ```

2. **Exclude missing distances**: When `radiusKm` is set, exclude users with null `distanceKm`
   ```typescript
   const radiusKm = parseOptionalNumber(req.query.radiusKm, 'radiusKm');
   if (radiusKm?.ok && radiusKm.value !== undefined) {
     where.distanceKm = { 
       lte: radiusKm.value,
       not: null  // Exclude users without distance
     };
   }
   ```

3. **Keep recommendations-only**: Do NOT leak this into search semantics
   - This filter belongs in recommendations handler only
   - Search uses different approach (Phase 2)

**Code Example**:
```typescript
// In recommendations handler
const radiusKm = parseOptionalNumber(req.query.radiusKm, 'radiusKm');
if (radiusKm?.ok && radiusKm.value !== undefined) {
  // Require viewer location
  const viewerProfile = await prisma.profile.findUnique({
    where: { userId: viewerId },
    select: { lat: true, lng: true }
  });
  
  if (!viewerProfile?.lat || !viewerProfile?.lng) {
    return json(res, { error: 'Viewer location required for radiusKm' }, 400);
  }
  
  // Filter by distance (exclude null distances)
  where.distanceKm = { 
    lte: radiusKm.value,
    not: null
  };
}
```

**Job Impact**: None (uses existing `MatchScore.distanceKm` data)

---

### Phase 2: Add Proximity to Search (When Demand Justifies)

**What**: Add lat/lng to `ProfileSearchIndex` and implement radius search

**Correct Approach**:
- Add lat/lng to materialized index
- Use bounding box → exact distance filtering
- Do NOT jump to spatial types yet

**Changes Required**:

1. **Schema** (`backend/prisma/schema/search.prisma`):
   ```prisma
   model ProfileSearchIndex {
     // ... existing fields ...
     lat  Decimal? @db.Decimal(9,6)
     lng  Decimal? @db.Decimal(9,6)
     
     @@index([lat, lng])  // Composite index for bounding box queries
   }
   ```

2. **Job** (`backend/src/jobs/profileSearchIndexJob.ts`):
   ```typescript
   await prisma.profileSearchIndex.upsert({
     // ... existing fields ...
     lat: user.profile.lat,
     lng: user.profile.lng,
   });
   ```

3. **Query Builder** (`backend/src/services/search/profileSearchQueryBuilder.ts`):
   ```typescript
   // Bounding box is MANDATORY (never run Haversine across full index)
   if (this.filters.radiusKm && this.filters.lat && this.filters.lng) {
     const boundingBox = calculateBoundingBox(
       Number(this.filters.lat), 
       Number(this.filters.lng), 
       this.filters.radiusKm
     );
     
     where.AND = where.AND || [];
     where.AND.push({
       lat: { 
         gte: boundingBox.minLat, 
         lte: boundingBox.maxLat,
         not: null  // Exclude null locations
       },
       lng: { 
         gte: boundingBox.minLng, 
         lte: boundingBox.maxLng,
         not: null
       }
     });
     
     // Store for exact distance filtering later
     this.proximityFilter = {
       centerLat: Number(this.filters.lat),
       centerLng: Number(this.filters.lng),
       radiusKm: this.filters.radiusKm
     };
   }
   
   // Exact distance filtering (post-query, in application layer)
   // After fetching results, filter by exact Haversine distance
   ```

4. **API** (`backend/src/registry/domains/profiles/handlers/search.ts`):
   ```typescript
   const { radiusKm, lat, lng } = req.query;
   
   // Require explicit location inputs
   if (radiusKm && (!lat || !lng)) {
     return json(res, { 
       error: 'lat and lng required when using radiusKm' 
     }, 400);
   }
   
   // Add to search params
   const searchParams: SearchParams = {
     // ... other params ...
     radiusKm: radiusKm ? Number(radiusKm) : undefined,
     lat: lat ? Number(lat) : undefined,
     lng: lng ? Number(lng) : undefined
   };
   ```

**Refinements (Strongly Recommended)**:

1. **Bounding Box is Mandatory**:
   - ✅ Always use: `lat BETWEEN minLat AND maxLat` + `lng BETWEEN minLng AND maxLng`
   - ✅ Then apply exact Haversine in application layer (cheaper + clearer)
   - ❌ Never run Haversine across the full index

2. **Treat Proximity as Filter, Not Sort** (v1):
   - ✅ Distance is a filter only (no sorting by default)
   - ❌ Do NOT sort by distance in v1 search
   - **Why**: Users don't expect "closest first" unless explicitly stated
   - **Why**: Distance sorting fights relevance, age, intent, etc.
   - **Future**: Add `sort=distance` as explicit option later

3. **Null-Location Users: Explicit Behavior**:
   ```typescript
   // Case: radiusKm present
   if (radiusKm) {
     // Exclude users with null lat/lng (explicit WHERE lat IS NOT NULL)
     where.lat = { not: null };
     where.lng = { not: null };
   }
   
   // Case: No radiusKm
   // Ignore location entirely (no filter on lat/lng)
   ```

4. **Require Explicit Location Inputs**:
   ```typescript
   // Never assume viewer location implicitly
   if (radiusKm && (!lat || !lng)) {
     return json(res, { 
       error: 'lat and lng required when using radiusKm' 
     }, 400);
   }
   ```
   - Avoids ambiguity and future bugs
   - Clear API contract

5. **Over-Fetch When Proximity Active**:
   ```typescript
   // Distance filters shrink result sets aggressively
   const baseFetchLimit = take * 3 + 1;
   const fetchLimit = radiusKm 
     ? Math.ceil(baseFetchLimit * 1.5)  // 1.5-2x multiplier
     : baseFetchLimit;
   ```
   - Prevents thin pages after exact-distance filtering
   - Rule of thumb: `fetchLimit *= 1.5-2` when `radiusKm` is present

**What NOT to Do (Yet)**:
- ❌ Don't add spatial `POINT` types yet
- ❌ Don't precompute distance buckets
- ❌ Don't merge search + recommendation distance logic
- ❌ Don't cache proximity queries
- ❌ Don't sort by distance by default

**All of those add complexity without user value right now.**

**Job Impact**: `profileSearchIndexJob` must copy lat/lng (minimal overhead)

---

## Comparison Matrix

| Feature | Live Query (Search) | Match Results (Recommendations) |
|---------|-------------------|--------------------------------|
| **Use Case** | User-driven search | System recommendations |
| **Scope** | All users with lat/lng | Only scored user pairs |
| **Query Speed** | 50-200ms (with index) | 10-50ms (simple filter) |
| **Flexibility** | Any location, any radius | Fixed user pairs only |
| **Implementation** | Requires schema change | Immediate (exists now) |
| **Index Updates** | Required (lat/lng copy) | Not needed (already exists) |
| **Null Handling** | Required (users without coords) | Not needed (only scored pairs) |
| **Cold Start** | Works immediately | Requires job to run |

---

## Recommended Next Steps

### Phase 1: Ship Now (Immediate)

1. ✅ **Add `radiusKm` to recommendations API**
   - Parameter: `radiusKm` on `/api/profiles/recommendations`
   - Filter: `MatchScore.distanceKm <= radiusKm` (exclude null)
   - Require: Viewer location (from profile or request)
   - Return: Distance in response (already available)
   - Job: None (uses existing `MatchScore.distanceKm` data)
   - Status: **Clean, low-risk win - ship immediately**

### Phase 2: Add When Needed (Future)

2. **Add proximity to search index** (when user demand justifies)
   - Schema: Add `lat`/`lng` to `ProfileSearchIndex`
   - Job: Update `profileSearchIndexJob` to copy coordinates
   - Query: Bounding box (mandatory) → exact Haversine (application layer)
   - API: Add `radiusKm`, `lat`, `lng` parameters (all required together)
   - Behavior: Proximity as filter only (no sorting by default)
   - Over-fetch: 1.5-2x multiplier when `radiusKm` is present

### Future Optimizations (Only if Scale Demands)

3. **Spatial index** (if performance becomes an issue)
   - Consider MySQL `POINT` type
   - Use `ST_Distance_Sphere` for queries
   - May require schema migration

4. **Distance-based sorting** (explicit option)
   - Add `sort=distance` parameter
   - Only when explicitly requested
   - Not default behavior

5. **Hybrid relevance scoring**
   - Combine distance with other relevance signals
   - Only if user value justifies complexity

---

## Key Insights

1. **Different Use Cases = Different Solutions**
   - Recommendations: Pre-computed is perfect (viewer-specific, already computed)
   - Search: Live querying is needed (user-driven, flexible location)

2. **Match Results Are Already There**
   - Don't duplicate work - use existing `MatchScore.distanceKm` for recommendations
   - Quick win with zero infrastructure cost

3. **Search Needs Flexibility**
   - Users want to search "near me" or "near location X"
   - Can't rely on pre-computed pairs
   - Materialized index is the right approach

4. **Performance Is Manageable**
   - Bounding box pre-filter is mandatory (fast, efficient)
   - Exact Haversine post-processing is cheap on small result sets
   - Spatial index is future optimization if needed

5. **Mental Model to Keep**
   - **Recommendations**: "Who should you see?" → precomputed, personal
   - **Search**: "Who exists near here?" → live, flexible
   - **Distance**: Filter first, rank later

---

## Conclusion

### Ship Now
✅ **Use match results for recommendations** (`radiusKm` on `/api/profiles/recommendations`)
- Immediate value, zero infrastructure cost
- Clean, low-risk win

### Add When Needed
✅ **Use live querying for search** (when user demand justifies)
- Materialized index with bounding box + exact distance
- Flexible, real-time proximity

The hybrid approach gives you the best of both worlds:
- Fast, pre-computed distances for recommendations
- Flexible, real-time proximity for search

**No need to choose one or the other - they solve different problems.**

**Your plan already follows this. Proceed exactly as outlined, with the refinements above.**
