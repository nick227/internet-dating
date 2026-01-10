# Near Me Implementation Plan

Goal: Replace the current text-only "Near Me" filter with a real distance-based search that returns profiles within a radius of the viewer.

## Overview
- Frontend: add radius-based filter for quick "Near Me" and advanced filters.
- Backend: add a distance-aware search route (or extend advanced search) that can filter/sort by distance.
- Data: ensure viewer and candidate profiles have lat/lng populated.
- Precalculation: maintain a searchable surface optimized for radius queries.
- Fallback: degrade gracefully when location data is missing.

## Key Decisions (recommended defaults)
1) Use Option A (extend ProfileSearchIndex)
- Why:
  - Already the search surface.
  - Geo is a search concern, not a profile concern.
  - Avoids cross-table joins during hot paths.
- Add columns:
  - `lat DOUBLE NULL`
  - `lng DOUBLE NULL`
  - `hasLocation BOOLEAN` (derived, indexed)

2) Do NOT use MySQL spatial types (yet)
- Why:
  - Bounding box + Haversine is enough at current scale.
  - Spatial indexes add migration/query complexity.
  - Harder to debug and paginate correctly.
- Revisit only if:
  - You exceed ~1–5M searchable profiles.
  - Geo becomes the dominant query type.

3) Default radius = 25km
- Quick filter: fixed 25km.
- Advanced presets: 10 | 25 | 50 | 100 (no free slider for now).

## Data & Precalculation
1) Profile location capture
- Ensure profiles store `lat`/`lng` (already present on `Profile`).
- Add validation so updates keep coordinates in sync with `locationText`.

2) Searchable snapshot
- Extend `ProfileSearchIndex` (or add a sibling table) with `lat` and `lng`.
  - Option A: add `lat`, `lng` columns to `ProfileSearchIndex` and update in `profileSearchIndexJob`.
  - Option B: create `ProfileSearchGeoIndex` (userId, lat, lng, isVisible, isDeleted) for fast geo filtering.
- Update `profileSearchIndexJob.ts` to write lat/lng (Option A) or add `profileSearchGeoIndexJob` (Option B).

3) Indexing strategy
- Add composite indexes for fast geo bounding-box filtering:
  - Example: `@@index([lat, lng])` or separate `@@index([lat])`, `@@index([lng])`.
- If using MySQL spatial features, consider POINT + SPATIAL INDEX.

## API & Routes
1) New/extended search endpoint
- Extend `GET /api/profiles/advanced-search` to accept:
  - `nearMe=true`
  - `radiusKm` (default 25)
  - `sort=distance`
- Decision: extend advanced search (no new endpoint).

2) Query behavior
- Resolve viewer location:
  - If viewer has no `lat/lng`, return 400 with actionable message.
- Filter by distance using a bounding box first, then refine with Haversine distance.
- Pagination:
  - Cursor should encode `userId` and `distanceKm` for stable paging.
- Sorting:
  - Default sort: distance asc when nearMe is active.
  - Otherwise use existing sort (`newest`, `age`).

## Backend Query Strategy (final)
1) Resolve viewer location
- Source: `ProfileSearchIndex`.
- If missing, return 400 with `{ "code": "LOCATION_REQUIRED" }`.

2) Bounding box (SQL)
- Compute once per request:
  - `latDelta = radiusKm / 111`
  - `lngDelta = radiusKm / (111 * cos(viewerLat))`
- SQL filter:
  - `lat BETWEEN minLat AND maxLat`
  - `lng BETWEEN minLng AND maxLng`
  - `hasLocation = true`
  - `isVisible = true`
  - `isDeleted = false`
  - `userId != viewerId`

3) Distance refine (application)
- Compute Haversine in JS.
- Filter `distanceKm <= radiusKm`.
- Attach `distanceKm` to each row.
- Avoid SQL Haversine for now to keep pagination stable.

4) Sorting + pagination
- When `nearMe=true`, force:
  - `distanceKm ASC`
  - `userId ASC` (stability)
- Cursor encodes `{ distanceKm, userId }`.

## Frontend Updates
1) Quick filter
- Update "Near Me" to set `{ nearMe: true, radiusKm: 25 }` instead of `location: "near me"`.

2) Advanced filters
- Add a radius preset selector: 10 / 25 / 50 / 100.
- Only show when viewer location is available (or show a hint to set location).

3) URL sync
- Update `serializeFiltersToURL` / `parseFiltersFromURL` for `nearMe` and `radiusKm`.

## Fallbacks
- If viewer has no location:
  - Return 400 with code `LOCATION_REQUIRED`.
  - Show a clear UI prompt to set location in profile.
- If candidates lack `lat/lng`, exclude from nearMe results.

## Rollout Plan
1) Schema + job updates
- Add columns and run migration.
- Update `profileSearchIndexJob` (and rerun it for all users).

2) Backend route changes
- Add `nearMe` handling and distance filtering.

3) Frontend updates
- Wire filters, UI, and URL sync.

4) Verify
- Run `searchable-user` + `profile-search-index`.
- Test a seeded user with lat/lng and confirm radius results.

## Location Capture & Data Model
Current state:
- Users enter a single freeform string (city/state/etc.) in `locationText`.
- This is dirty and error-prone for geo.

Recommended approach:
- Keep display text in `locationText`.
- Add normalized fields on `Profile`:
  - `locationCity`, `locationState`, `locationCountry` (if not already present)
  - `lat`, `lng` (authoritative geo coords)
- Add a `ProfileLocation` table only if we need history, privacy zones, or multi-location.
  - Not required for Near Me v1.

Capture options:
1) Geocode on save:
   - Use a geocoding provider to resolve city/state -> lat/lng.
   - Store both the normalized parts and lat/lng.
2) Device geolocation (best UX accuracy):
   - Ask permission, then reverse-geocode to city/state for display.
   - Persist lat/lng + normalized city/state.

Privacy note:
- Never expose raw lat/lng to clients.
- Only expose derived distance and display text.

## Open Questions (answered)
- Distance sorting default when `nearMe=true`: Yes.
- Default radius: 25km.
- Radius UI: presets only (10/25/50/100).
- nearMe without location: no; explicit error with CTA.

## Architectural Guardrail
Never mix geo logic into matching/scoring jobs. Near Me is a filter, not a score input.

## Risks & Considerations
- Source-of-truth drift: `hasLocation` is derived; still guard with `lat IS NOT NULL` and `lng IS NOT NULL`.
- Pagination stability: distance cursors must use rounded/normalized values to avoid float drift.
- Missing location UX: backend 400 must map to a clear UI state (not silent empty results).
- Indexing: use a composite `(hasLocation, lat, lng)` index; separate lat/lng indexes are insufficient.
- Query fan-out: enforce strict bbox limits to keep in-memory Haversine costs bounded.
- Data freshness: Near Me depends on `profileSearchIndexJob` accuracy and timeliness.
- Search coupling: extending advanced search adds branching; Near Me must not affect non-geo queries.
- Privacy: never expose raw lat/lng in serializers, logs, or debug payloads.
- Location quality: mixed capture methods can create boundary inconsistencies near radius edges.
- Future migration: spatial index adoption will require cursor and ordering compatibility planning.
