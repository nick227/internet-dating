# Video Capture Green Screen + Background Plan

## Goals
- Enable green screen removal with stock background replacement.
- Keep v1 lightweight and deterministic.
- Ensure preview, recording, and render share a single pipeline.

## Canonical Pipeline Decision (Required)
Problem:
- Preview, recording, and render are described as separate pipelines.

Correction:
- Canvas is the source of truth when green screen is enabled.
- Never switch pipelines mid-session.

Rules:
- If green screen ON:
  - preview = canvas
  - recording = canvas.captureStream()
  - render = same canvas graph
- If green screen OFF:
  - preview = raw camera stream
  - recording = raw camera stream
  - render = raw capture + optional audio mix

Switching pipelines mid-record is a bug factory.

## Required Lifecycle Rules
- Canvas + WebGL context is created when entering record with green screen ON.
- Canvas is destroyed on exit from review and on discard.
- Canvas is not reused across sessions.

Reason:
- WebGL context reuse causes silent GPU memory leaks on mobile.

## Background Change Timing
- Allowed: before record and during review.
- Not allowed: during active recording (v1).

## GPU / WebGL Scope Guardrails
Problem:
- WebGL + spill suppression + refinement is too large for v1.

Correction (V1 quality):
- Simple RGB distance key.
- Static threshold slider only.
- No edge feathering.
- No ML background removal.

## Shader Contract
GreenScreenShader contract:
- Input: camera frame texture.
- Output: RGBA frame with transparent keyed pixels.
- Threshold applies in linear RGB space.

## Background Catalog
- Mock stock list for now.
- Each item:
  - id
  - title
  - imageUrl
  - tags

## Render Engine Layer (Explicit)
Introduce a dedicated render layer:
```
/capture/render
  CanvasComposer
  GreenScreenShader
  AudioMixer
```
All capture surfaces feed into this layer.

## Testing Notes
- Lighting variance and green spill.
- Performance on low-end devices.
- Capture continuity when toggling green screen on/off (only between sessions).

## Performance Fallback Rule
If WebGL init fails or FPS drops below threshold:
- Disable green screen.
- Notify the user.
- Fall back to the raw camera pipeline.

## Scope Note
Audio mixing is handled upstream in the render engine and is out of scope for this document.

## Payload Expectations
```
{
  videoFile
  backgroundId?: string
  greenScreenEnabled: boolean
  captureDuration
}
```
