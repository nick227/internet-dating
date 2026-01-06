# Green Screen Status Summary

## Current State (Implemented)
- WebGL green screen pipeline with canvas output and MediaRecorder capture.
- Soft-threshold keying in YUV with basic spill suppression and premultiplied output.
- Tap-to-sample key color during capture (per session).
- Canvas resizes to video metadata and preserves aspect via quad scaling (letterbox/pillarbox).
- Internal downscale surface with FPS-based quality downgrade.
- WebGL context loss listeners with resource recreation.
- UI controls:
  - Enable/disable green screen in select state.
  - Background picker in review (solid color swatches).

## Known Limitations
- No user-facing controls for threshold or spill tuning.
- Key sampling is manual only (no auto-calibration).
- Background picker affects the next recording only.

## Files of Record
- WebGL keying: `frontend/src/ui/video-capture/render/GreenScreenShader.ts`
- Canvas composer: `frontend/src/ui/video-capture/render/CanvasComposer.ts`
- Capture integration: `frontend/src/ui/video-capture/hooks/useVideoCapture.ts`
- UI controls: `frontend/src/ui/video-capture/components/ReviewStage.tsx`, `frontend/src/ui/video-capture/VideoCaptureRoot.tsx`

## Suggested Next Steps
## What's Missing (High Impact)
- No tuning access for edge cases (lighting variance, wardrobe spill).
- No auto-calibration (first-use friction).
- Quality downgrade is silent (user confusion).

## Next Actions (Ordered)
- Auto-sample on record start.
- Sample center + corners for 300-500ms; use median + variance to seed threshold/spill.
- Add hidden advanced controls (dev flag / long-press): threshold, softness, spill strength.
- Add a one-shot toast + icon state when quality downgrades ("Quality reduced to maintain FPS").
- Persist background choice per session and apply immediately in review + carry to next take.

## Optional (Only If Needed)
- Edge feather pass (single-tap blur in alpha).
- Preset profiles (Indoor / Window light / Low light).
