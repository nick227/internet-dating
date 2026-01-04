# Video Capture Audio Overlay Plan

## Goals
- Integrate a royalty-free audio picker inside the capture flow.
- Keep v1 simple and low-friction.
- Defer full search/filters until usage proves it’s needed.

## Audio Picker — UX Scope Control
Problem:
- Search + filters + preview + BPM in v1 is too heavy.

Correction (V1):
- Curated buckets, no free-text search:
  - Random
  - Trending
  - Calm
  - Energetic
- Tap a track to preview; tap again to confirm.
- Keep the picker in a bottom panel inside review.

## Data Model (V1)
No BPM yet.
```
{
  id
  title
  duration
  previewUrl
  tags
}
```

## Flow Integration
- Audio picker is an overlay panel inside review.
- Selecting a track sets `overlay.url` (mock for now).
- Volume + offset remain available.
- Render step is the source of truth for final mix.

## Required Lifecycle Rules
- Audio element is created on selection.
- Audio element is destroyed on discard or track change.
- Only one audio overlay allowed in v1.
- No stacking, no crossfades, no trims.

## Track Change Timing
- Audio selection allowed: only in review.
- Audio changes during render: disabled.
- Audio changes after render: invalidate rendered mix.

## Timing and Sync Notes
Problem:
- “Render offline with synchronized timeline” hides real risk.

Correction:
- Preview sync ≠ render sync.
- Audio offset should be applied only in render step.
- Preview is best-effort; do not chase “desync” in preview.

## Preview Behavior Constraints
- Preview audio plays locally only.
- Preview audio does not route through canvas or MediaRecorder.
- Preview audio volume is not equal to render volume.

## Payload Expectations
Define early, even if mocked:
```
{
  videoFile
  audioTrackId?: string
  audioOffsetMs?: number
  audioVolume?: number
  captureDuration
}
```

## Testing Notes
- Preview audio playback on mobile Safari + Chrome.
- Render mix with different offsets.
