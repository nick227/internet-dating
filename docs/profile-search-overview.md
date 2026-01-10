# Profile Search Overview

This overview describes how profile search results are loaded and displayed in the UI, which routes are called, and which filters are available.

## UI flow
- Entry point: `frontend/src/ui/pages/ProfileSearchPage.tsx`.
- State and API orchestration: `frontend/src/core/profile/search/useProfileSearch.ts`.
- Results rendering and infinite scroll: `frontend/src/ui/profile/search/ProfileSearchResults.tsx`.

### How results are chosen
- If any filters are set (excluding `cursor`/`limit`), the UI uses advanced search.
- If no filters are set, the UI loads recommendations.
- Filters are mirrored into the URL query string via `parseFiltersFromURL` and `serializeFiltersToURL`.

## API routes used
### Recommendations (default, no filters)
- Frontend: `api.getRecommendations()` in `frontend/src/api/client.ts`.
- Route: `GET /api/profiles/recommendations`.
- Auth: user required.
- Backend handler: `backend/src/registry/domains/profiles/handlers/recommendations.ts`.
- Params: `limit`, `cursor`, optional `radiusKm`.
- Notes: uses MatchScore with multiple freshness tiers and fallback to lightweight scores. Filters out blocked users, deleted profiles, and self.

### Advanced search (filters applied)
- Frontend: `api.advancedSearch()` in `frontend/src/api/client.ts`.
- Route: `GET /api/profiles/advanced-search`.
- Auth: public (viewerId used if present to filter likes/self).
- Backend handler: `backend/src/registry/domains/profiles/handlers/search.ts`.
- Params:
  - `q`
  - `gender[]`
  - `intent[]`
  - `ageMin`, `ageMax`
  - `location`
  - `interests[]`
  - `interestSubjects[]`
  - `traits` (base64-encoded JSON array of `{ key, min, max, group }`)
  - `top5Query`, `top5Type`
  - `sort` (`newest` or `age`)
  - `limit`
  - `cursor`
- Notes: built by `ProfileSearchQueryBuilder` against `ProfileSearchIndex`, then hydrated from `Profile` for display fields.

### Filter support APIs
- Traits: `GET /api/profiles/search/traits` (used by `TraitFilter`).
- Interests:
  - `GET /api/interests/subjects` (filter tabs)
  - `GET /api/interests` (paged list for interest selection)

## Filters in the UI
- Quick filters: `frontend/src/ui/profile/search/ProfileSearchQuickFilters.tsx`.
  - All, Near Me (sets `location: "near me"`), Women, Men, Friends, Dating.
- Advanced filters: `frontend/src/ui/profile/search/ProfileSearchFilters.tsx`.
  - Text, Gender, Intent, Age range, Location, Traits (up to 3), Interests.

## Pagination behavior
- `ProfileSearchResults` uses an `IntersectionObserver` sentinel to call `loadMore`.
- `useProfileSearch` tracks `nextCursor` for both recommendations and advanced search.
- Recommendations cursor encodes `{ userId, score }` for stable ordering; advanced search uses the builder cursor from the search index.

## Common causes of "no results"
- Invalid/expired auth token for recommendations (401). This prevents loading defaults until refresh succeeds.
- Empty or stale `ProfileSearchIndex` (advanced search relies on it).
- Filters are too restrictive (age range, traits, or interests).

## Related docs
- `docs/profile-search-process.md`
- `docs/profile-search-architecture-review.md`
