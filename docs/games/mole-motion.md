# Mole Motion

Mole Motion is the experimental single-player whack-a-mole slice tracked by [issue #12](https://github.com/DupeisTaken/motion-capture-games/issues/12). It starts M2 software development at the user's request; M1 camera, identity, latency and hardware certification remain open. It must not claim production readiness or multiplayer certification.

## Rules and controls

Random moles appear in a bounded normalized camera-image play area. Touch mode hits a mole with an observed hand/wrist or foot/ankle proxy. Push mode requires an eligible hand, wrist or hip to move toward the screen while overlapping a mole. Push is a depth capability: existing 2D camera adapters cannot supply it. A labeled synthetic rehearsal supplies depth; the camera UI must explain and gate push rather than invent depth from image size. Each target scores once. A held touch must exit before rearming against a newly spawned target. Push needs a fresh return-and-push cycle; switching contact names cannot bypass this rule.

Timed lasts 60 active seconds; Challenge aims for 15 hits in 60 active seconds; Survival ends on the third expired mole; Practice is untimed without miss penalties. Pause, framing/tracking loss and readiness freeze round and target time. Recovery requires explicit resume with a short countdown, clears gesture history and never catches up missed time.

Easy/normal/hard vary target size and lifetime. Hard samples 32 candidates and favors the greatest minimum distance from currently available eligible contacts; missing contacts are excluded. The full target radius stays inside the configured play area; that image-space boundary is not yet a measured participant reach calibration. Difficulty never enlarges it. Defaults are unmeasured tuning proposals owned by `TUNING` in the game module.

| Setting | Easy | Normal | Hard |
| --- | --- | --- | --- |
| Normalized image-space radius | 0.065 | 0.052 | 0.040 |
| Target lifetime in active milliseconds | 3600 | 2500 | 1700 |

The default play rectangle is x=0.12, y=0.16, width=0.76, height=0.68. Push arms at displacement <=0.04m and hits on a fresh crossing >=0.12m while overlapping; any forward attempt consumes the cycle, even on a miss. These thresholds need calibrated depth and physical trials. Scoring awards 100 per hit plus 10 per consecutive hit above the first, capped at a 100 bonus. Escape resets the streak; Practice records no miss penalty. Start countdown is 3 seconds; resume is 2. The input freshness limit is 350ms; update interruptions over 400ms pause. User-facing new rounds receive a fresh random seed; the engine accepts an explicit seed for reproducible tests and replay.

## Ownership and input boundary

`packages/motion/src/game-input.ts` exports model-independent `MotionContact` and `GameMotionFrame`. Contacts use anatomical names and upright unmirrored normalized image x/y; optional `towardScreenM` is positive toward the screen relative to a stable calibrated reference. `atMs` is mapped source time on the browser monotonic timeline, not wall time. A frame carries version 1, epoch, sequence, slotId, identity, feetVisible, depthAvailable and spaceRevision. No provider indices enter games. Presentation mirrors both targets and input exactly once and contain-fits them with the video.

`packages/session` owns explicit joining to one confident camera-local track and anonymous player-1 slot. It never joins by array order or x position, never silently substitutes a track, and invalidates membership on epoch/calibration/transform/camera geometry changes. Its game-frame revision includes the exact joined track; changing tracks requires a new round so a previous score cannot move to another participant. Camera track association is experimental; a lost or uncertain player needs explicit rejoin rather than inferred continuity. The same-track rejoin is an operator action, not proof that M1 identity continuity has been measured.

`games/mole-motion` owns seeded target selection, collision, score, active game timeline and replay. The app owns camera control, bounded source-aligned packet delivery, video, controls and synthetic rehearsal. No camera or inference imports belong in a game. The existing diagnostic page remains available. Source time mapping preserves bigint nanosecond differences and processing age; the initial transport offset remains unknown. Targets are evaluated on the current active browser timeline with no exposure-based latency compensation. This is conservative software behavior, not verified exposure synchronization or physical motion-to-display latency.

Hit regions are circular in normalized image coordinates, so their displayed boundary is elliptical on rectangular images. Video, contact indicators and that boundary use the same contain-fit rectangle and one mirror transform; anatomical labels remain stable. The renderer shows track labels before joining. The app never imports a model or opens a camera; `/api/start` delegates acquisition to the existing vision process.

## Framing and failure policy

Both feet must be confidently observed in frame. Otherwise show “Step back — keep both feet in view” and suspend scoring/timers. Foot loss alone does not establish camera distance: explain that the participant may also need camera adjustment or to clear an occlusion. Missing eligible contacts, stale/future/non-monotonic samples, ambiguous identity and unavailable push depth cannot score. Clear motion history across all such discontinuities. Spectators never inherit the slot or score. A tab becoming hidden pauses play.

## Verification and gates

Seeded game-input replay version 1 reproduces targets, scores and outcomes for the same commands and timestamps. Tests cover every mode, both hit modes, one-shot/rearm rules, hard-placement bias, bounds, stale and malformed input, framing loss, identity/epoch/calibration changes, source ordering, pause/recovery, end/restart and UI configuration. Real-server English desktop/mobile screenshots verify the delivered interface using synthetic data. Physical pushes, actual camera framing accuracy, participant reach calibration, Windows/macOS hardware capacity, three-player attribution and physical latency still need measured trials.
