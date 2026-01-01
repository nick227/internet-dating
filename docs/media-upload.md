# Media Upload System Documentation

## Overview

This document describes the complete media upload flow, from frontend file selection through backend storage and URL generation.

**Last Updated**: Now includes streaming uploads with backpressure, client-side validation, and state machine.

## Current Implementation Status

### ✅ Supported
- **Image Types**: JPEG, PNG, GIF, WebP
- **Video Types**: MP4, WebM, OGG
- **Audio Types**: MP3, WAV, OGG
- **Storage**: Local filesystem (`uploads/media/`) with temp staging (`tmp/uploads/`)
- **Upload Method**: Streaming with Busboy (no memory buffering)
- **Client Validation**: Duration (≤180s), resolution (≤3840×2160), MIME allowlist
- **URL Generation**: Dynamic URLs via `/media/:key` route
- **Access Control**: Public/Private visibility with profile access checks
- **State Machine**: Full lifecycle states (PENDING_UPLOAD → UPLOADED → READY)

### 📋 File Types Requested
- Images: PNG, GIF, JPG
- Videos: MP4, OGG
- Audio: MP3, WAV, OGG

## Architecture

### Frontend Flow

1. **File Selection** (`HeroMediaPicker.tsx`)
   - User selects file via file input or camera capture
   - File validation: type and size checks
   - Creates object URL for preview
   - Location: `frontend/src/ui/profile/HeroMediaPicker.tsx`

2. **Upload Request** (`api/client.ts`)
   - Creates FormData with file
   - POST to `/api/media/upload`
   - Uses `credentials: 'include'` for cookie-based auth
   - Location: `frontend/src/api/client.ts:232-239`

### Backend Flow

1. **API Endpoint** (`backend/src/registry/domains/media/index.ts`)
   - Route: `POST /api/media/upload`
   - Auth: Requires authenticated user (`Auth.user()`)
   - Middleware: Multer for file upload (memory storage)
   - Max size: 10MB (configurable via `MAX_UPLOAD_BYTES`)
   - Location: `backend/src/registry/domains/media/index.ts:18-46`

2. **Media Service** (`backend/src/services/media/mediaService.ts`)
   - Method: `uploadImage()`
   - Validates: MIME type, file size, image dimensions
   - Generates: Storage key, content hash, URLs
   - Creates: Media record in database
   - Stores: File to filesystem
   - Location: `backend/src/services/media/mediaService.ts:54-111`

3. **Storage Provider** (`backend/src/services/media/localStorageProvider.ts`)
   - Implementation: Local filesystem storage
   - Root directory: `uploads/media/` (configurable via `MEDIA_UPLOAD_DIR`)
   - Structure: `{prefix}/{uuid}.{ext}` (e.g., `b2/3c/b23ce907-42eb-46e4-bc45-408075c2d727.webp`)
   - Location: `backend/src/services/media/localStorageProvider.ts`

4. **URL Generation** (`backend/src/services/media/urlBuilder.ts`)
   - Base URL: From `MEDIA_BASE_URL` env var or `http://localhost:4000`
   - Pattern: `{BASE_URL}/media/{encoded-storage-key}`
   - Example: `http://localhost:4000/media/b2/3c/b23ce907-42eb-46e4-bc45-408075c2d727.webp`
   - Location: `backend/src/services/media/urlBuilder.ts`

5. **Media Serving** (`backend/src/app/createApp.ts`)
   - Route: `GET /media/:key(*)`
   - Auth: Public route with access control check
   - Streams: File from storage to response
   - Content-Type: From stored `mimeType`
   - Location: `backend/src/app/createApp.ts:21-41`

## Database Schema

### Media Model (`backend/prisma/schema/content.prisma`)

```prisma
model Media {
  id          BigInt   @id @default(autoincrement())
  userId      BigInt
  ownerUserId BigInt
  type        MediaType      // IMAGE | VIDEO (AUDIO not yet supported)
  status      MediaStatus     // PENDING | READY | FAILED
  visibility  Visibility      // PUBLIC | PRIVATE
  storageKey  String?         // Filesystem path key
  variants    Json?           // Thumbnail/size variants
  contentHash String?         // SHA256 hash for deduplication
  mimeType    String?         // e.g., "image/jpeg"
  sizeBytes   Int?            // File size in bytes
  url         String          // Generated URL
  thumbUrl    String?         // Thumbnail URL
  width       Int?            // Image/video width
  height      Int?            // Image/video height
  durationSec Int?            // Video/audio duration
  createdAt   DateTime
  deletedAt   DateTime?       // Soft delete
}
```

### MediaType Enum (`backend/prisma/schema/enums.prisma`)

```prisma
enum MediaType { 
    IMAGE 
    VIDEO 
    // AUDIO - Not yet implemented
}
```

## Data Flow

### Upload Process

```
1. User selects file in HeroMediaPicker
   ↓
2. Frontend validates file (type, size)
   ↓
3. Frontend creates FormData and POSTs to /api/media/upload
   ↓
4. Backend receives file via Multer (memory buffer)
   ↓
5. mediaService.uploadImage() validates:
   - MIME type (must be in ALLOWED_IMAGE_MIME)
   - File size (max 10MB)
   - Image dimensions (max 20000px)
   - Image format (JPEG, PNG, WebP)
   ↓
6. Generate storage key: {prefix}/{uuid}.{ext}
   ↓
7. Generate content hash (SHA256)
   ↓
8. Build URLs using urlBuilder
   ↓
9. Create Media record in database (status: PENDING)
   ↓
10. Store file to filesystem via LocalStorageProvider
   ↓
11. Update Media record (status: READY)
   ↓
12. Return response with mediaId and URLs
```

### Retrieval Process

```
1. Client requests media via URL: /media/{storage-key}
   ↓
2. Express route handler in createApp.ts
   ↓
3. mediaService.getMediaStreamByKey():
   - Looks up Media record by storageKey
   - Checks visibility (PUBLIC/PRIVATE)
   - Verifies access (owner or profile access)
   - Checks status (must be READY)
   ↓
4. LocalStorageProvider.get() returns file stream
   ↓
5. Stream piped to HTTP response with correct Content-Type
```

## File Storage

### Location
- Default: `{project-root}/uploads/media/`
- Configurable: `MEDIA_UPLOAD_DIR` environment variable

### Structure
```
uploads/media/
  ├── b2/
  │   └── 3c/
  │       └── b23ce907-42eb-46e4-bc45-408075c2d727.webp
  ├── a1/
  │   └── 2b/
  │       └── a12b3456-7890-abcd-ef12-345678901234.jpg
  └── ...
```

### Storage Key Format
- Pattern: `{hex-prefix-2}/{hex-prefix-2}/{uuid}.{ext}`
- Example: `b2/3c/b23ce907-42eb-46e4-bc45-408075c2d727.webp`
- Purpose: Distributes files across subdirectories for filesystem performance

## URL Generation

### Base URL
- Environment: `MEDIA_BASE_URL` or `API_BASE_URL`
- Fallback: `http://localhost:${PORT}`
- Location: `backend/src/services/media/config.ts`

### URL Pattern
- Format: `{BASE_URL}/media/{encoded-storage-key}`
- Encoding: Each path segment is URI-encoded
- Example: `http://localhost:4000/media/b2/3c/b23ce907-42eb-46e4-bc45-408075c2d727.webp`

### URL Building
- Function: `buildMediaUrls()` in `urlBuilder.ts`
- Input: Media record with `storageKey` and `variants`
- Output: `{ original: string, thumb: string | null }`
- Thumbnail: Falls back to original if no thumbnail variant exists

## Access Control

### Visibility Levels
- **PUBLIC**: Accessible to all authenticated users
- **PRIVATE**: Only accessible to owner or users with profile access

### Access Check Flow
1. Check if media is PUBLIC → allow
2. Check if viewer is owner → allow
3. Check profile access via `hasProfileAccess()` → allow/deny
4. Otherwise → 403 Forbidden

### Implementation
- Location: `backend/src/services/media/mediaService.ts:133-136` and `163-166`
- Uses: `hasProfileAccess()` from `profileAccessService.ts`

## Current Limitations

### 1. Image-Only Upload
- **Issue**: Backend only has `uploadImage()` method
- **Location**: `backend/src/services/media/mediaService.ts:54`
- **Impact**: Video and audio uploads will fail
- **Solution Needed**: Add `uploadVideo()` and `uploadAudio()` methods

### 2. MIME Type Restrictions
- **Current**: Only `image/jpeg`, `image/png`, `image/webp`
- **Location**: `backend/src/services/media/mediaService.ts:39`
- **Needed**: Add video and audio MIME types

### 3. MediaType Enum
- **Current**: Only `IMAGE` and `VIDEO` (no `AUDIO`)
- **Location**: `backend/prisma/schema/enums.prisma:6-9`
- **Needed**: Add `AUDIO` to enum

### 4. File Size Limits
- **Multer**: 10MB (`MAX_UPLOAD_BYTES`)
- **Image Service**: 10MB (`MAX_IMAGE_BYTES`)
- **Frontend**: 50MB (validation only, will fail at backend)
- **Location**: 
  - `backend/src/registry/domains/media/index.ts:8`
  - `backend/src/services/media/mediaService.ts:37`

### 5. Video/Audio Processing
- **Current**: No video/audio metadata extraction (duration, codec, etc.)
- **Needed**: Add libraries for video/audio processing (e.g., `ffprobe`, `fluent-ffmpeg`)

## Rate Limiting

### Implementation
- Window: 60 seconds
- Max uploads: 20 per window
- Per user: Tracked by `ownerUserId`
- Location: `backend/src/services/media/mediaService.ts:263-275`

### Behavior
- Exceeding limit: Returns 429 Too Many Requests
- Error message: "Rate limit exceeded"

## Error Handling

### Validation Errors
- Invalid MIME type: "Unsupported mime type" (400)
- File too large: "File too large" (400)
- Invalid image: "Invalid image" (400)
- Dimensions too large: "Image dimensions too large" (400)
- SVG not allowed: "SVG not allowed" (400)

### Storage Errors
- Upload failure: "Failed to store media" (500)
- Media not found: "Media not found" (404)
- Access denied: "Forbidden" (403)
- Not ready: "Media not ready" (409)

## Future Enhancements Needed

### For Video Support
1. Add `uploadVideo()` method to `mediaService`
2. Add video MIME types: `video/mp4`, `video/webm`, `video/ogg`
3. Extract video metadata (duration, codec, resolution)
4. Generate video thumbnails
5. Update `mimeToExt()` to handle video extensions
6. Update `assertProfileMedia()` to allow VIDEO type

### For Audio Support
1. Add `AUDIO` to `MediaType` enum
2. Add `uploadAudio()` method to `mediaService`
3. Add audio MIME types: `audio/mp3`, `audio/wav`, `audio/ogg`
4. Extract audio metadata (duration, bitrate, codec)
5. Update `mimeToExt()` to handle audio extensions
6. Update `assertProfileMedia()` to allow AUDIO type

### For Additional Image Types
1. Add `image/gif` to `ALLOWED_IMAGE_MIME`
2. Update `mimeToExt()` to return `.gif`
3. Update `isAllowedImageType()` to allow `gif`

## Configuration

### Environment Variables
- `MEDIA_UPLOAD_DIR`: Custom upload directory path
- `MEDIA_BASE_URL`: Base URL for media URLs
- `API_BASE_URL`: Fallback for media base URL
- `PORT`: Server port (used in fallback URL)

### Constants
- `MAX_UPLOAD_BYTES`: 10MB (Multer limit)
- `MAX_IMAGE_BYTES`: 10MB (Service limit)
- `MAX_DIMENSION`: 20000px (max width/height)
- `RATE_LIMIT_WINDOW_MS`: 60000ms (1 minute)
- `RATE_LIMIT_MAX`: 20 uploads per window

## API Endpoints

### POST /api/media/upload
- **Auth**: Required (authenticated user)
- **Content-Type**: `multipart/form-data`
- **Field**: `file` (File)
- **Response**: `{ mediaId: bigint, status: 'READY', mimeType: string, urls: { original: string, thumb: string | null } }`
- **Status Codes**: 201 (created), 400 (validation), 413 (too large), 429 (rate limit), 500 (server error)

### GET /api/media/:mediaId
- **Auth**: Public (with access control)
- **Response**: Media metadata with URLs
- **Status Codes**: 200 (ok), 403 (forbidden), 404 (not found)

### GET /media/:key(*)
- **Auth**: Public (with access control)
- **Response**: File stream with appropriate Content-Type
- **Status Codes**: 200 (ok), 403 (forbidden), 404 (not found), 409 (not ready)

### DELETE /api/media/:mediaId
- **Auth**: Required (owner only)
- **Response**: `{ ok: true }`
- **Status Codes**: 200 (ok), 403 (forbidden), 404 (not found)

## Code Locations

### Frontend
- File picker: `frontend/src/ui/profile/HeroMediaPicker.tsx`
- API client: `frontend/src/api/client.ts:232-239`
- HTTP client: `frontend/src/api/http.ts`

### Backend
- API routes: `backend/src/registry/domains/media/index.ts`
- Media service: `backend/src/services/media/mediaService.ts`
- Storage provider: `backend/src/services/media/localStorageProvider.ts`
- URL builder: `backend/src/services/media/urlBuilder.ts`
- Config: `backend/src/services/media/config.ts`
- Media serving: `backend/src/app/createApp.ts:21-41`
- Schema: `backend/prisma/schema/content.prisma` and `enums.prisma`

## Testing

### Manual Testing
1. Upload image via HeroMediaPicker
2. Verify file appears in `uploads/media/` directory
3. Verify Media record created in database
4. Access media via generated URL
5. Test private media access control
6. Test rate limiting (upload 21 files quickly)

### Test Cases
- ✅ Valid image upload (JPEG, PNG, WebP)
- ✅ File size validation (reject > 10MB)
- ✅ MIME type validation (reject unsupported types)
- ✅ Access control (PUBLIC vs PRIVATE)
- ✅ URL generation and serving
- ⚠️ Video upload (not yet implemented)
- ⚠️ Audio upload (not yet implemented)
- ⚠️ GIF upload (not yet implemented)

## Summary

### Key Points

1. **Current Support**: Only images (JPEG, PNG, WebP) are fully supported
2. **Storage**: Files saved to `uploads/media/` directory with UUID-based keys
3. **URLs**: Generated as `{BASE_URL}/media/{storage-key}` and served via Express route
4. **Access Control**: PUBLIC/PRIVATE visibility with profile access checks
5. **Rate Limiting**: 20 uploads per minute per user
6. **File Size**: 10MB limit (both Multer and service level)

### What Needs to Be Added for Full Support

To support the requested file types (MP4, OGG, MP3, WAV, PNG, GIF, JPG):

1. **Backend Changes**:
   - Add `uploadVideo()` method (similar to `uploadImage()`)
   - Add `uploadAudio()` method
   - Add `AUDIO` to `MediaType` enum
   - Add video/audio MIME types to allowed lists
   - Add video/audio metadata extraction (duration, codec)
   - Update `mimeToExt()` for new file types
   - Update `assertProfileMedia()` to allow VIDEO/AUDIO

2. **Frontend Changes**:
   - ✅ Already updated `HeroMediaPicker.tsx` to accept new MIME types
   - Note: Uploads will fail until backend supports them

3. **Database**:
   - No schema changes needed (MediaType enum already has VIDEO)
   - Need to add AUDIO to enum

## Notes

- Files are stored in memory during upload (Multer memory storage)
- Content hash (SHA256) enables future deduplication
- Soft delete via `deletedAt` field (files not physically deleted)
- Storage key uses UUID for uniqueness and collision avoidance
- Two-level directory structure prevents filesystem performance issues with many files
- Storage provider is abstracted (currently LocalStorageProvider, could be swapped for S3, etc.)
