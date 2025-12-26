# Media Handling Roadmap (Revised)

## Current state (codebase)
- DB schema has `Media`, `PostMedia`, and `Post` but no dedicated upload or media service.
- Profile has no `avatar` field and no media ownership link (only posts reference media).
- API returns media metadata on feed/profile reads, but there is no API to create media records or upload files.
- Frontend uses media URLs already present in responses and falls back to initials-based avatars.

## Goals
- Support avatars + profile photos/videos with a modular media pipeline.
- Keep storage/CDN/optimization providers swappable.
- Ship minimal local-dev upload first, then add CDN and image optimization without breaking URLs.

## Architecture (modular layers)
- **MediaService (domain-level hardening)**:
  - Only place that validates ownership, sets visibility, and transitions status (PENDING -> READY -> FAILED).
  - Routes must not access storage directly.
  - Routes must not set variants directly.
- **StorageProvider (keep it dumb)**:
  - Interface limited to `put(stream, key, meta)`, `get(key)`, `delete(key)`.
  - No `userId`, `visibility`, or `variants` passed in.
  - Uses opaque storage keys, never filenames.
- **Processing pipeline**: image resize, thumbnail, video poster + transcode.
- **MediaUrlBuilder (critical)**:
  - Single place for origin/CDN/optimized URL rules.
  - No route or UI builds URLs manually.
  - Origin URLs remain stable while optimized variants are added later.
- **Background jobs**: process media asynchronously and update `Media` metadata.

## Database schema refinements (proposed)
- `Media`:
  - `ownerUserId` (required).
  - `status` enum (PENDING | READY | FAILED).
  - `variants` JSON (additive only).
  - `contentHash` for dedupe.
  - Metadata: `mimeType`, `sizeBytes`, `width`, `height`, `durationSec`.
  - Store storage keys (not URLs) for original + variants.
- `Profile`:
  - `avatarMediaId` (nullable).
  - `heroMediaId` (nullable) for profile header.

## API changes (proposed)
- Phase 1 upload: `POST /api/media/upload`
  - Accept multipart form.
  - Return `{ mediaId, urls }`.
  - Internally mark media as READY.
- Future: presigned/multipart flows after Phase 1.
- `GET /api/media/:id` -> returns metadata + URLs.
- `PATCH /api/profiles/:userId` -> allow `avatarMediaId`, `heroMediaId`.
- Update `/api/inbox`, `/api/matches`, `/api/profiles/:userId` to include avatar media URLs.

## Frontend media contract (proposed)
- `Avatar` accepts only `src?: string` with initials fallback.
- No media logic in UI; URLs always come from API responses.
- Post composer uploads first, then creates post with `mediaIds`.

## Phase plan
### Phase 1: Local upload + metadata
- Implement local disk storage provider (e.g. `/uploads`) with opaque keys.
- Add `POST /api/media/upload` (multipart).
- Store keys + metadata, mark READY.
- Update profile endpoints to accept `avatarMediaId`.
- Guardrails (immediate):
  - Max file size.
  - MIME whitelist.
  - Per-user rate limits.
  - Reject SVG uploads.
  - Validate image headers (not filename-based).

### Phase 2: Image optimization pipeline
- Add image processor (sharp or equivalent) with multiple sizes.
- Store variants in `Media.variants` JSON.
- Update URL builder to prefer optimized variants.
- Rules: never overwrite originals; variants are additive only.

### Phase 3: Video support
- Add poster extraction and basic transcode.
- Store poster and duration.
- Frontend always uses poster for initial render.

### Phase 4: CDN + signed URLs
- Use URL builder to switch origin -> CDN.
- Support signed URLs only for private media.
- Keep origin URLs as fallback.
- Avoid hard-coding CDN assumptions anywhere.

### Phase 5: Observability + cleanup
- Background job monitoring.
- Cleanup orphaned media + failed uploads.
- Access logs and rate limits on uploads.
  - Log by mediaId, not filename.

## Orphaned media cleanup (define now)
- Media created but never attached -> delete after N hours.
- Media detached from profile/post -> soft-delete, then purge.
- Background job handles cleanup.

## Visibility rules (clarify early)
- Public: avatars, profile photos, posts.
- Private: future DM media.
- Avoid over-generalizing visibility logic prematurely.

## Migration safety
- Never delete old URL fields.
- Stop reading them gradually.
- Add new fields alongside existing ones.
- Preserve backward compatibility.

## Observability (Phase 5)
- Track upload failures, processing duration, storage errors.
- Log by mediaId, not filename.
- Rate-limit uploads with visibility into abuse.

## Risks / decisions
- Public vs private media impacts CDN, caching, signed URLs.
- Migration strategy: keep old URL fields stable while adding keys/variants.
- Cost control: size limits, file type validation, and rate limits are required.

## Bottom line
Your plan is sound. These improvements reduce rewrite risk, prevent URL breakage, keep costs controlled, and align with the registry + domain architecture.
