# Geolocation Near Me Feature Summary

This doc summarizes how Near Me works end-to-end, including data flow, APIs, and the UI behavior.

## Overview
- Near Me is a distance-based filter that returns profiles within a radius of the viewer.
- Distances are computed in km server-side and displayed in miles in the UI.
- The feature relies on `ProfileSearchIndex` containing `lat`, `lng`, and `hasLocation`.

## Data Flow (high level)
1) User sets location
   - Manual: enter `locationText` in Advanced Filters and save.
   - Device: click “Use device,” which uses browser geolocation and reverse geocoding.
2) Profile update
   - Manual updates store `locationText` and clear `lat`/`lng`.
   - Device updates store `locationText`, `lat`, and `lng`.
3) Search index refresh
   - `profileSearchIndexJob` copies `lat`, `lng`, and derives `hasLocation`.
4) Near Me query
   - UI sets `nearMe=1` and `radiusKm` (defaults to 25km).
   - Backend filters with bbox + Haversine, then sorts by distance.

## Key Routes
- `POST /api/profiles/location/reverse`
  - Reverse-geocodes `lat`/`lng` to a displayable `locationText`.
  - Uses Nominatim by default (dev).

- `PATCH /api/profiles/:userId`
  - Persists `locationText`, `lat`, `lng` for the current user.

- `GET /api/profiles/advanced-search`
  - Params: `nearMe`, `radiusKm`, `sort=distance`.
  - Returns paginated profiles with distance-based match reasons.

## Backend Query Strategy
1) Resolve viewer location from `ProfileSearchIndex`.
   - Missing location returns `400 { code: "LOCATION_REQUIRED" }`.
2) Bounding box filter (SQL) using `lat/lng`.
3) Haversine distance in application layer; filter to `radiusKm`.
4) Sort by distance, then userId; cursor encodes `{ distanceKm, userId }`.

## UI Behavior
- Quick filter “Near Me” toggles `nearMe=true` and `radiusKm=25`.
- Advanced filters expose:
  - “Your location” (view/edit)
  - “Use device” button
  - Radius presets (10/16/31/62 mi)
- Distance is displayed as “X mi away.”

## Jobs and Migrations
- Migration adds `lat`, `lng`, `hasLocation` to `ProfileSearchIndex`.
- Run after migration:
  - `searchable-user`
  - `profile-search-index`

## Environment (dev defaults)
- Uses public Nominatim endpoint if `NOMINATIM_BASE_URL` is not set.
- Optional: set `NOMINATIM_EMAIL` for better request hygiene.

## Failure States & UX
- If viewer has no location, Near Me returns `LOCATION_REQUIRED`.
- UI should surface a prompt to set location or use device.

## Privacy Notes
- Raw `lat/lng` should never be exposed in responses or logs.
- Only display distance and `locationText` in the UI.
