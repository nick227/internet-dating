# Profile Search Architecture Review

**Date**: 2024
**Reviewer**: Auto
**Status**: ✅ **ALIGNED** with architecture constraints

## Summary

The current profile search implementation correctly follows the architecture constraints defined in `profile-search-architecture-constraints.md`. All key requirements are met.

---

## ✅ MatchScore Usage - COMPLIANT

### ProfileSearchQueryBuilder
- **Status**: ✅ **COMPLIANT**
- **Location**: `backend/src/services/search/profileSearchQueryBuilder.ts`
- **Finding**: No MatchScore usage found. The builder is purely index-based and deterministic.
- **Evidence**: Grep search confirmed zero matches for "MatchScore" or "matchScore" in the file.

### Advanced-Search Endpoint
- **Status**: ✅ **COMPLIANT**
- **Location**: `backend/src/registry/domains/profiles/index.ts` (lines 978-1178)
- **Finding**: No MatchScore usage. Sort options are explicit (`newest`, `age`).
- **Evidence**: 
  - Sort validation only allows `newest` and `age` (line 1004)
  - No MatchScore queries or sorting logic
  - No hidden fallback to recommendations

### Recommendations Endpoint
- **Status**: ✅ **COMPLIANT**
- **Location**: `backend/src/registry/domains/profiles/index.ts` (lines 1181-1424)
- **Finding**: Correctly uses MatchScore as an explicit data source.
- **Evidence**:
  - Uses `prisma.matchScore.findMany()` (line 1241)
  - Requires `Auth.user()` authentication (line 1184)
  - Explicitly documented as "personalized profile recommendations based on MatchScore" (line 1185)

---

## ✅ ViewerId Handling - COMPLIANT

### ProfileSearchQueryBuilder
- **Status**: ✅ **COMPLIANT**
- **Location**: `backend/src/services/search/profileSearchQueryBuilder.ts`
- **Finding**: Properly guards all viewerId usage.
- **Evidence**:
  - `viewerId` is typed as `bigint | undefined` (line 75)
  - Block filtering is guarded: `if (this.viewerId) { ... }` (line 95)
  - No unsafe parsing of undefined viewerId

### Advanced-Search Endpoint
- **Status**: ✅ **COMPLIANT**
- **Location**: `backend/src/registry/domains/profiles/index.ts` (line 985)
- **Finding**: Correctly handles optional viewerId.
- **Evidence**:
  - Uses `viewerId = req.ctx.userId ?? undefined` (line 985)
  - Works for anonymous users (endpoint uses `Auth.public()` at line 981)
  - All viewer-specific logic is guarded (lines 1082-1085)

### Recommendations Endpoint
- **Status**: ✅ **COMPLIANT**
- **Location**: `backend/src/registry/domains/profiles/index.ts` (line 1188)
- **Finding**: Correctly requires authentication.
- **Evidence**:
  - Uses `viewerId = req.ctx.userId!` (line 1188)
  - Requires `Auth.user()` (line 1184)
  - No anonymous access allowed

---

## ✅ Frontend Flow - COMPLIANT

### useProfileSearch Hook
- **Status**: ✅ **COMPLIANT**
- **Location**: `frontend/src/core/profile/search/useProfileSearch.ts`
- **Finding**: Implements correct decision logic as specified in constraints.
- **Evidence**:
  ```typescript
  // Lines 137-150
  if (hasAnyFilters) {
    // Use advanced search when filters are applied
    search(debouncedFilters)
  } else if (isAuthenticated) {
    // Use recommendations when no filters and user is authenticated
    loadRecommendations()
  } else {
    // Anonymous users: show empty state
    setResults([])
    setNextCursor(null)
    setLoading(false)
  }
  ```
- **Compliance**:
  - ✅ Frontend explicitly chooses data source
  - ✅ No hidden heuristics
  - ✅ Anonymous users get explicit empty state
  - ✅ Same render path for both sources

---

## ✅ Anonymous User Handling - COMPLIANT

### Frontend
- **Status**: ✅ **COMPLIANT**
- **Location**: `frontend/src/core/profile/search/useProfileSearch.ts` (lines 144-149)
- **Finding**: Anonymous users get explicit empty state.
- **Evidence**:
  ```typescript
  } else {
    // Anonymous users: show empty state (no recommendations available)
    // Do not invent anonymous ranking logic - keep it explicit
    setResults([])
    setNextCursor(null)
    setLoading(false)
  }
  ```
- **Compliance**:
  - ✅ Shows empty state (explicit)
  - ✅ No random profiles
  - ✅ No anonymous ranking logic
  - ✅ No hidden heuristics

### Backend
- **Status**: ✅ **COMPLIANT**
- **Finding**: Advanced-search endpoint supports anonymous users.
- **Evidence**:
  - Uses `Auth.public()` (line 981)
  - `viewerId` is optional (line 985)
  - Block filtering only runs when `viewerId` exists (ProfileSearchQueryBuilder line 95)

---

## ✅ Endpoint Separation - COMPLIANT

### Advanced-Search Endpoint
- **Status**: ✅ **COMPLIANT**
- **Path**: `/api/profiles/advanced-search`
- **Auth**: `Auth.public()` (supports anonymous)
- **Purpose**: Deterministic, index-based search
- **Finding**: Single-purpose, no hidden logic

### Recommendations Endpoint
- **Status**: ✅ **COMPLIANT**
- **Path**: `/api/profiles/recommendations`
- **Auth**: `Auth.user()` (requires authentication)
- **Purpose**: Personalized recommendations using MatchScore
- **Finding**: Single-purpose, explicit data source

---

## ✅ Sort Options - COMPLIANT

### Advanced-Search Endpoint
- **Status**: ✅ **COMPLIANT**
- **Location**: `backend/src/registry/domains/profiles/index.ts` (lines 1002-1006)
- **Finding**: Only explicit sort options allowed.
- **Evidence**:
  ```typescript
  const sortValue = (sort as string) || 'newest';
  if (sortValue !== 'newest' && sortValue !== 'age') {
    return json(res, { error: 'Invalid sort value. Supported: newest, age' }, 400);
  }
  ```
- **Compliance**:
  - ✅ No hidden MatchScore sorting
  - ✅ Sort is explicit and predictable
  - ✅ Default is explicit (`newest`)

### ProfileSearchQueryBuilder
- **Status**: ✅ **COMPLIANT**
- **Location**: `backend/src/services/search/profileSearchQueryBuilder.ts` (lines 221-232)
- **Finding**: Only implements deterministic sorts.
- **Evidence**:
  ```typescript
  switch (sortType) {
    case 'newest':
      return [{ accountCreatedAt: 'desc' }, { userId: 'desc' }];
    case 'age':
      return [{ age: 'asc' }, { userId: 'desc' }];
    default:
      return [{ accountCreatedAt: 'desc' }, { userId: 'desc' }];
  }
  ```

---

## 📋 Code Review Checklist Results

- [x] No MatchScore in ProfileSearchQueryBuilder ✅
- [x] No hidden sorting by MatchScore in advanced-search ✅
- [x] All viewerId usage properly guarded ✅
- [x] Anonymous paths are explicit (no hidden logic) ✅
- [x] Recommendations endpoint is separate from search ✅
- [x] Frontend explicitly chooses data source ✅

---

## 📋 Testing Checklist (Recommended)

- [ ] Anonymous users see explicit empty state (not random)
- [ ] Search with filters is deterministic
- [ ] Recommendations require authentication
- [ ] No MatchScore affects search filtering
- [ ] Block filtering only runs for authenticated users
- [ ] No userId parsing errors

---

## 🔍 Additional Observations

### Current User Exclusion
- **Location**: `backend/src/registry/domains/profiles/index.ts` (lines 1082-1085)
- **Finding**: Advanced-search endpoint excludes the current user from results.
- **Status**: ✅ **APPROPRIATE** - This is a reasonable UX decision and doesn't violate architecture constraints.

### Transitional Join
- **Location**: `backend/src/registry/domains/profiles/index.ts` (lines 1096-1100)
- **Finding**: Comment documents a transitional join for media URLs.
- **Status**: ✅ **DOCUMENTED** - The join is explicitly allowed for hydration only, not filtering.

---

## ✅ Final Verdict

**The implementation is fully aligned with the architecture constraints.**

All requirements are met:
- ✅ Search filtering is deterministic and index-based
- ✅ Recommendations are an explicit data source
- ✅ MatchScore is not used in search
- ✅ ViewerId handling is properly guarded
- ✅ Anonymous users get explicit empty state
- ✅ Frontend explicitly chooses data source
- ✅ No hidden heuristics or fallbacks

No changes required.
