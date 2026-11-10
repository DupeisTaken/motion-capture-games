# Dodgeball

Dodgeball is an experimental single-player camera-overlay game tracked by [issue #18](https://github.com/DupeisTaken/motion-capture-games/issues/18) and [PR #19](https://github.com/DupeisTaken/motion-capture-games/pull/19). It starts an early M4 software slice at the user's request, building on [Mole Motion](mole-motion.md) and its explicit session/recovery conventions. M1 physical-camera, identity, capacity and latency gates remain open; this slice does not certify M4 participant playtests.

## Rules and experience

Avoid virtual balls using your visible body. One warning ring previews a ball's exact image-space footprint before a brief danger window. Move clear and stay clear until the ball passes. A ball can hit once; after its danger window is avoided, it awards 100 points plus 10 for each consecutive dodge above the first, capped at a 100-point bonus. A hit removes 50 points, floored at zero, and resets the streak; Practice records contacts without either penalty. The visible head, torso and limb outlines are the collision regions. Anatomical left/right stay stable; video, body shapes and hazards share one contain-fit rectangle and explicit mirror transform.

Timed lasts 60 active seconds. Survival ends on the third hit. Practice runs until End round, without losing lives. Difficulty changes ball size and warning time, with no depth or physical-ball input. Rehearsal moves a synthetic full body using pointer, touch or arrow keys; this exercises game logic without a camera or inference service. Camera input requires explicit start and selection of a confident track, then Join player 1. No spectator joins automatically.

Keep lateral movements small and comfortable, clear the physical play area, and adjust camera placement before starting. This game does not require jumping or contacting the display. The normalized play boundary is a visual guide, not calibrated safe room geometry. Ball and body dimensions, spawn patterns and timing are unmeasured tuning proposals; physical trials at varied heights and movement ranges remain required.

## Collision and missing-input policy

`packages/motion` adapts named canonical joints into a `DodgeMotionFrame`, extending the existing game-input envelope. Required joints are nose, both shoulders, elbows, wrists, hips, knees and ankles. Only confidently observed, finite, in-frame normalized coordinates are eligible. Missing joints never silently shrink the collision body: the game pauses instead. The engine owns head/torso/limb geometry, intersections, obstacle selection, scoring, active time and seeded replay; the renderer draws the same exported shapes.

Both feet must remain observed. Otherwise the warning reads **“Step back — keep both feet in view.”** and explains that camera adjustment or clearing an occlusion may also help. Feet loss alone does not prove distance. Missing upper-body joints use a separate full-body tracking message. Missing/stale/future/uncertain input and source, track, calibration or clock changes cannot advance obstacles, time or score.

Start uses a 3-second readiness countdown; recovery requires explicit resume and a 2-second countdown. Countdown and active time freeze on invalid input. Pause retains the pending ball's position, phase and remaining time; it never fast-forwards or catches up. Any pause, including manual pause, makes the pending ball ineligible for a dodge reward because part of the movement was unobserved. That ball still appears and clears normally after recovery; any previously counted hit remains counted. Changed track/source/calibration requires a fresh round so score cannot move to another participant. Same-track recovery requires explicit rejoin after identity loss; that operator action is not proof of identity continuity.

## Timing and ownership

The existing one-slot session maps source nanosecond differences onto the browser monotonic timeline, preserving processing age and bounded packet order. The initial network transit remains unknown. The game uses one paused active simulation timeline and rejects stale observations; this is not verified exposure synchronization or physical-latency compensation. The general input freshness allowance is 350 ms and simulation interruptions above 400 ms trigger a pause. Updates that touch a danger window require browser-step, source-age and source-gap allowances of at most 150 ms; slower input pauses rather than skipping the short hazard window.

Collisions are sampled 2D body proxies, not swept or continuous physical collision detection. Only a new raw pose whose source-mapped active time lies inside the half-open danger interval can hit; render ticks cannot create new scoring samples or apply a later pose backward. A clean-dodge decision waits for a source sample at or after the danger interval ends, allowing an earlier delayed contact to resolve before the reward. Motion between samples is not inferred, so sufficiently fast unsampled motion can be missed; physical trials must determine whether a different collision policy is required. All poses used for scoring retain the same identity, epoch and space revision.

| Proposed tuning | Easy | Normal | Hard |
| --- | --- | --- | --- |
| Normalized ball radius | 0.065 | 0.080 | 0.095 |
| Warning time | 2000 ms | 1700 ms | 1400 ms |
| Danger window | 300 ms | 300 ms | 300 ms |
| Clearing time | 500 ms | 500 ms | 500 ms |

The engine's `TUNING` owns these values. The head radius is 0.045 and limb/torso-edge capsule radius is 0.018 in normalized image coordinates; on a rectangular source image these circles display as ellipses. The torso also includes its filled shoulder/hip polygon. Each ball is seeded near the current torso center and clamped entirely inside x=0.08..0.92 and y=0.10..0.92. This is image-space tuning rather than measured room distance or participant dimensions.

The app controls the existing local vision service and bounded paired JPEG/observation delivery, retaining one decoded image. Generation checks release late bitmaps and prevent a stopped source reviving. Game modules never open cameras, import inference libraries or use vendor landmark indices. Vision exports observations without hit decisions. No new wire schema, runtime dependency, depth provider or camera acquisition path is introduced.

Start and Resume use the engine's current, nonmutating readiness assessment: stale input, incomplete bodies, uncertain identity and changed source/clock state cannot enable a misleading action. The selected camera track remains stable while poses update; a joined track is locked and labeled. Camera release uses the shared epoch-scoped `CameraReleases` controller introduced by the Mole Motion review. Failed or rejected stop requests retain their acknowledged epoch and expose **Retry camera stop**, even after switching to rehearsal. Starting another camera remains blocked until release is confirmed; a stopped local preview alone does not prove camera capture has ended.

## Verification and remaining gates

Behavior tests cover collision regions, all modes, seeded replay, warning/danger phases, one-shot outcomes, invalid body input, framing/tracking/clock interruptions, identity/revision boundaries and restart. Viewer tests cover actual controls and source lifecycle. [The self-contained HTML report](../../reports/dodgeball.html) records the exact checks and real-server English desktop/mobile screenshots actually obtained.

The software supports one explicitly enrolled slot. Physical avoidance/framing accuracy, height/clothing/occlusion variation, movement comfort, camera/video alignment, external motion-to-visible latency, hardware capacity, macOS operation and multiplayer remain unmeasured. Synthetic tests and review ratings do not close those gates.
