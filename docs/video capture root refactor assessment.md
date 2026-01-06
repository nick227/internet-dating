High-level assessment
Current state: functional but over-coupled.
VideoCaptureRoot is acting as:
a page controller
a state machine coordinator
an escape / lifecycle policy manager
a UI layout component
a cross-hook synchronization layer
This makes it:
fragile under change
difficult to reason about
prone to ref/closure hacks (which you already feel)
You’ve already crossed the threshold where this component is doing too much orchestration logic for React to help you.
Core SoC problems

1. UI + flow control are interleaved

VideoCaptureRoot mixes:
rendering decisions (cap.mode === 'record')
business rules (“if recording and back pressed, confirm discard”)
async flow control (pendingDiscardRef, stop → discard chain)
lifecycle policy (when to clear audio, when to reopen camera)
Smell:
If you removed JSX, this file would still be ~70% non-presentation logic.
That means this is not a “root view” — it’s a controller disguised as a component.

2. Ref-based “anti-React” synchronization is a warning sign

You have many refs whose sole purpose is to fight React’s render model:
discardRef
stopRecordingRef
modeRef
isRecordingRef
clearRef
pendingDiscardRef
onRequestCloseRef

This is not bad engineering — it’s a signal.
It means:
your state machine is implicit, not explicit
transitions are happening outside React’s normal dataflow
you’re compensating instead of modeling
Once refs become the source of truth, React is no longer helping you.

3. useVideoCapture is doing too much and too little

Right now:
useVideoCapture owns:
camera lifecycle
recorder lifecycle
mode
status
BUT:
navigation rules live in the UI
discard/stop semantics are split
error recovery is partly external
timing logic is external
This creates split authority:
The hook appears to be the domain owner
The component actually decides what happens
That’s why bugs are hard to reason about.

4. Navigation/back behavior is embedded policy

handleBack() is a state transition policy engine, not a UI handler.
It encodes rules like:
review → discard
record → confirm → stop → discard
select → close
This logic:
cannot be reused
cannot be tested independently
cannot be reasoned about without reading the whole file
That is classic “controller logic leaking into view”.

5. Timer is bolted on, not part of the domain

useRecordingTimer lives next to the capture domain but is not part of it.
Result:
timer drives stop
recorder drives blob
UI stitches them together
This is why edge cases appear at start/stop boundaries.
What’s actually missing: an explicit Capture State Machine
You currently have an implicit state machine spread across:
useVideoCapture
refs in VideoCaptureRoot
effects reacting to cap.recorded
timer callbacks
You need an explicit coordinator.
Recommended SoC architecture

1. Introduce a Capture Controller (headless)

Create a hook or service that owns all capture flow decisions:
useCaptureController({
  duration,
  greenScreenEnabled,
  backgroundColor,
  onExit,
  onPost,
})

Rules:
No refs exposed to UI
No UI branching logic outside
All transitions happen inside controller
Your current VideoCaptureRoot becomes mostly JSX.

2. Push “back / escape / discard” policy into the controller

Instead of:
handleBack()
You want:
actions.back()
The controller decides:
whether to confirm
whether to stop first
whether to discard later
whether to exit
This removes:
pendingDiscardRef
modeRef
isRecordingRef
all related effects

3. Merge timer into the capture domain

Recording duration is not UI state — it’s a capture invariant.
Move timer logic into the controller or useVideoCapture:
recorder start sets startedAt
controller schedules auto-stop
UI just renders remaining time
This eliminates:
useRecordingTimer as an external coordinator
onMaxReached indirection
ref gymnastics to avoid stale callbacks

4. Make useVideoCapture purely infrastructural

After refactor:
useVideoCapture should only:
open/close camera
start/stop recorder
produce blob
expose low-level status
It should NOT:
decide modes
manage navigation
coordinate discard flows
Think of it as a driver, not a controller.

5. VideoCaptureRoot should be dumb
After changes, this component should:
render based on controller.view
wire buttons to controller.actions
pass props downward
If this file still needs refs after refactor, something is wrong.
Litmus test (important)
After restructuring:
Can you describe the entire capture flow without mentioning React refs or effects?
If yes → architecture is sound.
If no → logic is still leaking.
Right now, you cannot.
Bottom line
What you have is clever, defensive, and experienced — but overloaded.
The ref-heavy design is not the problem; it’s the symptom.
The real issue:
no single owner of capture flow
implicit state machine
UI forced to coordinate async media primitives
If you introduce a headless capture controller and demote the root component to presentation, your current bugs become structurally impossible, not just “fixed”.
Minimal first step (biggest payoff)
Move ALL navigation + discard + stop policy out of VideoCaptureRoot into a controller hook
Do not touch:
JSX structure
useVideoCapture
CameraStage, ReviewStage, etc.
Do remove from the component:
handleBack
pendingDiscardRef
modeRef, isRecordingRef, discardRef, stopRecordingRef
Escape key logic
All “if recording then stop then discard” orchestration
Replace all of that with:
const controller = useCaptureFlowController({...

Eliminates all ref gymnastics
Centralizes the implicit state machine
Removes async coordination from JSX
Makes bugs reproducible and testable
Leaves media internals untouched

What stays in VideoCaptureRoot:

rendering
simple event forwarding
layout
No business rules. No flow control.
Minimal controller responsibilities (v1)

This controller does not replace useVideoCapture.
It wraps it.

Responsibilities:
Back / escape behavior
Stop-then-discard sequencing
Pending discard after stop
Audio cleanup coordination
Begin / discard sequencing

It does NOT:
open cameras
start recorders
manage streams
render UI