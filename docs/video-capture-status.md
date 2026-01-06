# Video Capture Status & Issues

## Overview
The video capture system provides a multi-stage flow: duration selection → camera recording → review → post. It supports green screen background replacement, audio overlays, and automatic timer-based recording.

## Flow Analysis

### 1. Select Stage (`view === 'select'`)
- User selects duration (10s, 30s, 60s)
- User clicks "Open camera" to proceed
- **Entry Point**: `VideoCaptureRoot` → `DurationSelectPanel` → `cap.begin()`

### 2. Record Stage (`view === 'record'`)
- Camera stream opens (permission requested)
- Green screen composer initialized if enabled
- User clicks "Start" to begin recording
- Timer counts down, auto-stops at max duration
- User can manually stop or cancel
- **Entry Point**: `cap.begin()` → `openCamera()` → `setMode('record')`
- **Exit Point**: Recording stops → blob created → `setMode('review')`

### 3. Review Stage (`view === 'review'`)
- Displays recorded video with playback controls
- User can add caption/note
- User can add audio overlay (file, volume, offset)
- User can toggle green screen (affects next recording only)
- User can select background color (affects next recording only)
- User can "Retry" (re-record) or "Post"
- **Entry Point**: Blob ready → `setMode('review')`
- **Exit Point**: `onPost()` or `onDiscard()` → `handleReviewDiscard()`

### 4. Post Stage
- Calls `onPost(file, note)` callback
- Cleans up audio overlay and recorded blob
- Resets to select stage
- **Entry Point**: User clicks "Post" → `onPost()` → `handlePostComplete()`

## Identified Issues & Bugs

### 🔴 Critical Issues

#### 1. Green Screen Background Not Applied to Final Video
**Location**: `ReviewStage.tsx`, `useVideoCapture.ts`

**Problem**: 
- Green screen settings (enabled/background color) are only applied during live recording preview via `CanvasComposer`
- The recorded blob does NOT contain the green screen background replacement
- In review stage, the toggle says "Applies to next recording" (line 197) - confirming it doesn't affect current video
- When posting, the final video still has the original background, not the replaced one

**Impact**: Green screen feature is non-functional for the actual posted video - only works in preview

**Expected Behavior**: 
- Green screen should be applied during recording (currently works)
- OR green screen should be applied during review/post rendering (currently missing)

**Code References**:
```86:111:frontend/src/ui/video-capture/VideoCaptureRoot.tsx
{view === 'review' && cap.recorded && (
    <ReviewStage
      recorded={cap.recorded}
      overlay={audio.overlay}
      greenScreenEnabled={greenScreenEnabled}
      backgroundColor={backgroundColor}
      backgroundOptions={backgroundOptions}
      onToggleGreenScreen={setGreenScreenEnabled}
      onSelectBackground={setBackgroundColor}
      onDiscard={controller.handleReviewDiscard}
      onPost={(finalBlob, note) => {
        // ... posts the blob without green screen applied
      }}
    />
)}
```

#### 2. Re-record Flow Race Condition
**Location**: `useCaptureController.ts` → `handleReviewDiscard()`

**Problem**:
- `handleReviewDiscard` calls `cap.discard()` (synchronous, sets mode to 'select')
- Then immediately calls `void cap.begin()` (async, not awaited)
- `cap.begin()` has a `beginInFlightRef` guard but race conditions possible
- If user clicks "Retry" multiple times quickly, could cause issues

**Impact**: Potential state inconsistencies, camera might not open properly

**Code Reference**:
```97:102:frontend/src/ui/video-capture/hooks/useCaptureController.ts
const handleReviewDiscard = useCallback(() => {
  console.log('[capture] review:discard')
  audio.clear()
  cap.discard()
  void cap.begin()  // Not awaited, potential race condition
}, [audio, cap])
```

#### 3. Audio Overlay Rendering Error Handling
**Location**: `ReviewStage.tsx` → `doRender()`

**Problem**:
- If `renderMixedWebm` fails, it shows an alert but doesn't prevent posting
- The `renderedBlob` remains null, so posting falls back to original blob without audio
- No user feedback about what went wrong or retry option
- Error could be swallowed silently if alert is blocked

**Impact**: User might post video without audio overlay without knowing

**Code Reference**:
```29:68:frontend/src/ui/video-capture/components/ReviewStage.tsx
const doRender = async () => {
  // ... setup ...
  try {
    const out = await renderMixedWebm({...})
    setRenderedBlob(out)
    return out
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Failed to render mix')  // Only alert, no state update
  } finally {
    hiddenVideo?.remove()
    setRendering(false)
  }
}
```

### 🟡 Medium Issues

#### 4. Post Complete State Reset
**Location**: `useCaptureController.ts` → `handlePostComplete()`

**Problem**:
- After posting, `handlePostComplete` clears audio and discards
- `cap.discard()` sets mode to 'select', but if there's an error during post callback, state might be inconsistent
- No explicit mode reset in `handlePostComplete`

**Impact**: Minor - state should be correct, but not explicit

**Code Reference**:
```104:108:frontend/src/ui/video-capture/hooks/useCaptureController.ts
const handlePostComplete = useCallback(() => {
  console.log('[capture] post:complete')
  audio.clear()
  cap.discard()  // Sets mode to 'select' internally
}, [audio, cap])
```

#### 5. Timer Reset on Start
**Location**: `CameraStage.tsx`

**Problem**:
- When user clicks "Start", it calls `onResetTimer()` then `onStart()`
- If user clicks Start multiple times quickly, timer could reset mid-recording
- No guard against multiple rapid clicks

**Impact**: Timer could reset unexpectedly if user double-clicks

**Code Reference**:
```40:49:frontend/src/ui/video-capture/components/CameraStage.tsx
<button
  className="btn primary"
  onClick={() => {
    props.onResetTimer()  // Resets timer
    props.onStart()       // Starts recording
  }}
  type="button"
>
  Start
</button>
```

#### 6. Error State Recovery
**Location**: `VideoCaptureRoot.tsx`

**Problem**:
- When an error occurs (`cap.status.kind === 'error'`), error message is displayed
- But there's no "Retry" or "Go Back" button in error state
- User must use browser back or close modal to recover

**Impact**: Poor UX - user stuck on error screen

**Code Reference**:
```150:155:frontend/src/ui/video-capture/VideoCaptureRoot.tsx
{cap.status.kind === 'error' && (
  <div className="col">
    <div style={{ fontWeight: 700 }}>Error</div>
    <div className="meta">{cap.status.message}</div>
    {/* No action buttons */}
  </div>
)}
```

#### 7. Blob URL Memory Leak Potential
**Location**: `useVideoCapture.ts`

**Problem**:
- Blob URL created in useEffect (line 204) but cleanup depends on `rec.blob` changing
- If component unmounts before cleanup, URL might not be revoked
- Multiple recordings could create multiple URLs

**Impact**: Potential memory leak with multiple recordings

**Code Reference**:
```199:216:frontend/src/ui/video-capture/hooks/useVideoCapture.ts
useEffect(() => {
  if (!rec.blob) return
  
  const blobUrl = URL.createObjectURL(rec.blob)  // Created but...
  setRecorded({ blob: rec.blob, mimeType: rec.mimeType, createdAt: Date.now() })
  // ...
  
  return () => {
    URL.revokeObjectURL(blobUrl)  // Only revoked when rec.blob changes
  }
}, [rec.blob, rec.mimeType, closeCamera])
```

### 🟢 Minor Issues

#### 8. Green Screen State Change During Recording
**Location**: `useVideoCapture.ts` → `ensureComposer()`

**Problem**:
- Green screen settings can change while recording is in progress
- `ensureComposer` has some guards but background color changes might not update properly during active recording
- Background color changes in review stage only affect "next recording"

**Impact**: Confusing UX - changes don't apply immediately

#### 9. Audio Overlay Sync Edge Cases
**Location**: `ReviewStage.tsx` → audio sync logic

**Problem**:
- Audio sync logic (lines 96-130) handles play/pause/seek, but edge cases:
  - If video duration < audio offset, audio might not play
  - If user seeks backward past offset, audio might not sync correctly
  - No handling for video/audio duration mismatches

**Impact**: Audio might not sync perfectly in edge cases

#### 10. Missing Loading States
**Location**: Multiple components

**Problem**:
- No loading indicator when opening camera (permission request)
- No loading indicator when rendering audio overlay
- "Rendering" state exists but no visual feedback

**Impact**: User doesn't know system is working during async operations

## Recommendations

### Priority 1 (Critical)
1. **Fix Green Screen Application**: Either apply during recording (already works) OR render green screen into final blob during review/post stage
2. **Fix Re-record Race Condition**: Await `cap.begin()` in `handleReviewDiscard` or add proper state guards
3. **Improve Audio Rendering Error Handling**: Show error state in UI, prevent posting if render fails, provide retry option

### Priority 2 (High)
4. **Add Error Recovery UI**: Add "Retry" or "Go Back" button in error state
5. **Fix Blob URL Cleanup**: Ensure cleanup on unmount, track all created URLs
6. **Add Loading States**: Show spinners/indicators for async operations

### Priority 3 (Medium)
7. **Prevent Timer Reset During Recording**: Disable Start button or add guard
8. **Improve Audio Sync**: Handle edge cases for duration mismatches
9. **Clarify Green Screen UX**: Make it clear when settings apply (current vs next recording)

## Testing Checklist

- [ ] Record video with green screen enabled - verify background is replaced in final video
- [ ] Click "Retry" multiple times quickly - verify no race conditions
- [ ] Add audio overlay, cause render to fail - verify error handling
- [ ] Trigger error state - verify recovery options work
- [ ] Record multiple videos in sequence - verify no memory leaks
- [ ] Change green screen settings during review - verify they apply to next recording
- [ ] Test audio overlay with various offsets and durations
- [ ] Test on mobile devices (camera permissions, performance)

## Architecture Notes

### State Management
- `VideoCaptureRoot`: Manages duration, green screen settings (UI state)
- `useCaptureController`: Orchestrates capture flow, handles navigation
- `useVideoCapture`: Manages camera, recording, green screen composer
- `useAudioOverlay`: Manages audio file, volume, offset
- `useRecordingTimer`: Manages recording timer

### Key Dependencies
- `CanvasComposer`: Handles green screen background replacement (live preview only)
- `renderMixedWebm`: Renders video + audio overlay into final blob (no green screen)
- `useMediaRecorder`: Wraps MediaRecorder API
- `useMediaStream`: Manages camera stream

### Data Flow
1. User selects duration → `setDuration()`
2. User clicks "Open camera" → `cap.begin()` → `openCamera()` → `setMode('record')`
3. User clicks "Start" → `cap.startRecording()` → MediaRecorder starts
4. Timer reaches max → `stopRecording()` → blob created → `setMode('review')`
5. User adds audio/caption → state updates
6. User clicks "Post" → `renderMixedWebm()` (if audio) → `onPost()` → `handlePostComplete()` → reset
