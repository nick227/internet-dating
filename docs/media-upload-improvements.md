# Media Upload Improvements Implementation

## Summary

Implemented critical fixes and improvements based on the critique and best practices for Railway-safe uploads.

## Critical Fixes Applied

### 1. ✅ Fixed Post Creation Type Restriction

**Problem**: Post creation only accepted IMAGE type, breaking video/audio posting.

**Fix**: Removed `type: 'IMAGE'` restriction in `backend/src/registry/domains/feed/index.ts:386`

**Before**:
```typescript
await mediaService.assertOwnedMediaIds(parsedMediaIds, userId, {
  requireReady: true,
  requirePublic: vis === 'PUBLIC',
  type: 'IMAGE'  // ❌ Hardcoded
});
```

**After**:
```typescript
await mediaService.assertOwnedMediaIds(parsedMediaIds, userId, {
  requireReady: true,
  requirePublic: vis === 'PUBLIC',
  // ✅ No type restriction - accepts IMAGE, VIDEO, AUDIO
});
```

### 2. ✅ Added AUDIO to MediaType Enum

**Problem**: AUDIO type missing from enum, preventing audio uploads.

**Fix**: Added `AUDIO` to `MediaType` enum in `backend/prisma/schema/enums.prisma`

**Migration Required**: Run `npx prisma migrate dev --name add_audio_media_type`

### 3. ✅ Updated assertOwnedMediaIds to Support AUDIO

**Fix**: Updated type signature to include `'AUDIO'` in `backend/src/services/media/mediaService.ts`

### 4. ✅ Implemented Orphan Protection

**Problem**: Media uploaded but post creation fails = orphaned media.

**Fix**: Created `backend/src/services/media/orphanProtection.ts` with:
- `cleanupOrphanedMedia()` - Removes media not attached to posts/avatars/hero after 24h
- `validateMediaForAttachment()` - Validates before post creation
- Transaction-based attachment in post creation (atomic)

**Note**: Full refState field requires schema migration. Current implementation uses PostMedia existence as attachment proof.

### 5. ✅ Improved Size Limits

**Updated limits** (conservative for Railway):
- Images: 10MB → 20MB
- Videos: 50MB → 200MB  
- Audio: 50MB → 80MB

**Location**: `backend/src/services/media/uploadHandler.ts`

### 6. ✅ Improved Upload Timeouts

**Updated timeouts** (fail fast):
- Max upload time: 15min → 5min
- Idle timeout: 60s → 30s

**Location**: `backend/src/services/media/streamingUpload.ts`

## State Machine Improvements

### Media Status Flow

Current implementation:
```
PENDING_UPLOAD → UPLOADED → READY
```

Recommended (future):
```
PENDING_UPLOAD → UPLOADED → STORED → PROBING → READY
```

**Current**: Images go directly to READY (validated during upload). Video/audio also go to READY (processing jobs not yet implemented).

**Future**: Add PROBING state for metadata extraction jobs (ffprobe for duration/resolution validation).

## Server Protection (Already Implemented)

✅ **Streaming parser** - Busboy (not Multer memory)
✅ **Hard limits** - File size, timeouts
✅ **Backpressure** - Streams directly to disk
✅ **Two-phase finalize** - tmp/ → final path
✅ **Cleanup** - Temp files deleted on abort/error

## Remaining Work

### High Priority

1. **Add refState field to Media model** (schema migration)
   - Track UNATTACHED → ATTACHING → ATTACHED
   - Enables better orphan cleanup

2. **Implement cleanup job** for orphaned media
   - Run hourly
   - Delete media with no PostMedia/avatar/hero links after 24h

3. **Add server-side duration/resolution validation**
   - For video: Use ffprobe to verify duration ≤ 180s, resolution ≤ 4K
   - For audio: Use ffprobe to verify duration ≤ 180s
   - Enqueue as processing job (don't block upload)

4. **Add upload progress tracking**
   - Use XHR `upload.onprogress` in frontend
   - Display progress bar in UI

5. **Add cancel button** during upload
   - Use AbortController (already in code)
   - Add UI button to trigger abort

### Medium Priority

6. **Implement metadata extraction job**
   - Use ffprobe for video/audio
   - Extract duration, resolution, codec
   - Update Media record with metadata

7. **Add retry mechanism** for failed uploads
   - Allow retry of failed files only
   - Don't re-upload successful files

8. **Improve error messages**
   - Standardize across all components
   - Make messages actionable

### Low Priority

9. **Client-side image optimization** (optional)
   - Downscale/compress images before upload
   - Use createImageBitmap() + canvas
   - Quality ~0.8-0.9, max edge 2048px

10. **Add upload queue management**
    - Prioritize uploads
    - Limit concurrent uploads

## Migration Steps

1. **Run Prisma migration**:
   ```bash
   cd backend
   npx prisma migrate dev --name add_audio_media_type
   ```

2. **Deploy backend** with updated code

3. **Set up cleanup job** (cron or scheduled task):
   ```typescript
   // Run hourly
   import { cleanupOrphanedMedia } from './services/media/orphanProtection'
   await cleanupOrphanedMedia(24) // 24 hour max age
   ```

## Notes

- **Client-side validation** is the primary defense (fast, cheap)
- **Server-side validation** is the security layer (must re-validate)
- **Processing jobs** handle heavy work (ffprobe, thumbnails) asynchronously
- **Orphan cleanup** prevents storage waste from failed post creations
- **Transaction-based attachment** prevents race conditions
