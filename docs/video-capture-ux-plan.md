# Video Capture UI/UX + Sheet Conversion Plan

## Goals
- Replace the modal with a full-height sheet that fills the shell on mobile and desktop.
- Keep the capture flow fast and thumb-first: select -> record -> review -> post.
- Avoid modal-specific traps that break mobile behavior.

## Sheet Conversion (Phase 1) — Hidden Risk Callout
Problem:
- “Keep the modal logic but remove backdrop” is risky. Modals and sheets diverge in:
  - focus trapping
  - scroll locking
  - keyboard dismissal
  - history/back navigation

Correction:
- Do not reuse modal behavior wholesale.
- Extract shared primitives (portal, z-index, animation).
- Create a `SheetContainer` with:
  - no focus trap
  - internal scrolling only
  - explicit close gesture (swipe / button)
- This avoids weeks of mobile bugs.

## Sheet Close Semantics
- Closing the sheet:
  - from select -> dismiss immediately
  - from record -> requires explicit confirm
  - from review -> confirm discard

## Capture Flow State — Tightened Model
Keep a single linear capture state. Treat audio/background as edit layers, not steps.

Recommended state model:
- select
- record
- review
  - audio (overlay panel)
  - background (overlay panel)
- post

No new top-level states.

## Back Navigation Mapping
- Back gesture / ESC:
  - review -> record (discard recording)
  - record -> confirm -> select
  - select -> dismiss sheet

## Layout and Interaction
- Full-sheet layout with safe-area paddings.
- Bottom actions are primary (record/stop/post).
- Panels slide up from bottom for audio/background.
- Minimal copy, short labels, visible state feedback.

## Overlay Panel Rules
- Only one overlay panel open at a time.
- Opening a new panel closes the previous one.
- Panels never open during active recording.

## Caption Input Rules
- Caption input locks sheet scroll while focused.
- Auto-scrolls input above keyboard.
- Closes keyboard on panel open.

## UI Scope (V1)
- Duration selection: 10s / 30s / 60s.
- Record: start/stop + timer + flip camera.
- Review: playback + caption + post.
- Audio/background openers inside review stage (overlay panels).

## Duration Selection Placement
- Dedicated select state view.
- Not a floating control during record.
- Not changeable mid-session.

## Action Hierarchy
- Primary: Record / Stop / Post.
- Secondary: Flip camera, open audio/background.
- Tertiary: Close / Cancel.

## Visual System
- Use `frontend/src/styles/components/capture/index.css` only.
- No global body styles.
- Keep typography + spacing aligned to tokens.

## Testing Notes
- Mobile widths: 360, 390, 430.
- Safe-area insets for top/bottom overlays.
- Back gesture + close button behavior.
