# Single-player motion runner

## Status and scope

Experimental playable implementation at `runner.html`, requested before physical M1/M6 certification. Neon Rails and Gold Rush share a deterministic three-lane game engine, with original procedural 3D worlds and Nova, Moss and Ember skins. Subway Surfers and Talking Tom Gold Run are gameplay references; their code, characters and assets are not dependencies.

The camera-free software slice implements the rules below. The existing canonical observation/session boundary supplies experimental camera controls. Numeric tuning is proposed and synthetic-tested; physical accuracy, body-size/reach coverage, exposure timing and end-to-end latency remain open milestone gates. [Issue #39](https://github.com/DupeisTaken/motion-capture-games/issues/39) / [PR #44](https://github.com/DupeisTaken/motion-capture-games/pull/44) tracks implementation; [the delivery report](../../reports/motion-runner-game.html) records actual verification and limitations.

## Presentation and player admission

- Show a runner advancing automatically through a scrolling world. Physical running in place and forward travel are not required controls.
- Provide three virtual lanes: left, center and right. The player moves within a bounded physical play area; the avatar supplies forward travel.
- Show a rendered game world during play. Setup/practice uses lane guides and recognized-action cues. Camera imagery is never displayed in this runner, including setup and practice.
- Admit exactly one anonymous session slot. A higher-capacity rig does not enable multiplayer for this game. Reject additional join attempts visibly; spectators cannot take over the existing slot.
- Keep operator pause/stop available. Tracking status, lane/action feedback and recovery instructions must remain visible without relying only on sound or color.

A perspective or 2.5D presentation is an art-direction option, not a requirement for calibrated 3D pose reconstruction. The initial controls should be tested with model-independent body observations before adding depth requirements.

## Control mapping

| Player movement | Intended game input | State and repeat policy |
| --- | --- | --- |
| Move into the left band | Select left lane | Absolute lane selection; holding left does not repeatedly step or wrap lanes. |
| Return to the center band | Select center lane | Center is an explicit selection, not absence of input. |
| Move into the right band | Select right lane | Absolute lane selection; same hold policy as left. |
| Jump | Start a virtual jump to clear low obstacles | One event per validated takeoff/landing cycle; repeated airborne samples do not retrigger. |
| Squat | Duck under overhead obstacles | A held posture state; release after a valid return to standing. Holding a squat does not repeatedly trigger rewards. |

Left/right mean the participant's physical left/right while facing the display, matching the corresponding on-screen lane. Use a documented mapping from canonical coordinates into the installation's display-relative horizontal axis. Preserve anatomical joint names and apply the mirror transform once to camera presentation; toggling a practice preview must not reverse game controls. Do not infer player identity from lane position.

The initial lane policy uses calibrated body-center position with stable lane bands and hysteresis. Boundary jitter keeps the last valid lane until a new band is established. Returning from either side to center must be recognized. A direct left-to-right movement selects the newly established band without queuing extra relative steps; virtual lane transition timing and collision occupancy must be defined and replay-tested before implementation acceptance.

Lane selection remains available during a jump or duck when its required evidence is valid. Jump and duck are mutually exclusive vertical states. If vertical evidence conflicts, issue no new vertical transition; if required evidence cannot establish a usable state, enter the pause policy below. Do not turn a squat, landing compression or isolated head movement into a jump. Squat depth and jump detection must suit the participant's comfortable movement range.

## Calibration and practice

1. Verify camera framing and a clear play area for lateral steps, overhead clearance, landing and squatting. Keep the player away from the display and nearby people.
2. Join one slot explicitly and establish a comfortable standing center, body-size reference and reachable left/right bands within the installation boundary.
3. Practice all three lane selections and their holds, a jump/landing cycle, and squat/stand. Display what was recognized before enabling hazards or scoring.
4. Confirm required joints/derived body signals are usable through the full movement range. Refuse start with an actionable explanation if the profile cannot support them; do not silently substitute a different control.
5. Begin a visible countdown once the player is ready. Recalibrate when camera geometry or the physical play area changes; invalidate incompatible input history.

Candidate signals include named hip/shoulder positions for body center, torso/leg posture for squatting, and temporally consistent body/foot evidence for jumping. The minimum capability set and treatment of temporarily hidden joints require trials; no vendor joint indices or trained classifier is used. Proposed normalized numeric thresholds are listed under the experimental choices below. Store selected thresholds, units, normalization and rationale in versioned configuration with replay evidence.

## Motion and game boundary

- Vision publishes canonical observations, identity quality, source time and missing/stale status. It never emits obstacle hits, lane rewards or scores.
- The motion layer provides model-independent position, posture/vertical evidence and validity over time. Preserve source timestamps, clock mappings and epoch/transform revisions; do not derive action timing from arrival order alone.
- Session owns one-player admission, slot binding, practice/countdown and pause/recovery. Single-player does not justify associating an arbitrary visible person to the joined slot.
- The runner owns lane bands/selection, jump and duck interpretation, virtual movement, obstacle collision windows, distance, rewards and results. Only extract a shared action primitive after another game demonstrates the same need.
- The application composes the rendered world and setup feedback using the existing vision boundary. The game does not open cameras, import inference libraries or depend on model-specific landmarks.

Game-input replay must include the lane selections and vertical transitions actually consumed, their mapped times, validity and ordered pause/recovery events. Record versions, configuration, initial state, seed and timestep under the existing [replay boundaries](../coordinates-and-timing.md#replay-boundaries). This is semantic guidance, not a new wire schema.

## Uncertainty, pause and recovery

Required input that is missing, stale, outside the play boundary or identity-ambiguous suspends the entire runner simulation. Freeze forward travel, obstacles, collision evaluation, distance, timers that affect outcomes and scoring on the same game timeline. Presentation may explain the loss while the world is frozen. Never treat an unknown pose as center/standing, extrapolate through loss for scoring, or keep hazards advancing toward a suspended player.

On camera disconnect, clock/stream epoch change, transform change or calibration invalidation, discard incompatible motion/action history. Recovery must not replay queued lane changes, invent a landing/takeoff, preserve a stale duck as fresh input or fast-forward accumulated wall time. Clear transient action state and use a documented safe resume position/obstacle window so recovery cannot create an immediate collision.

Re-establish the same joined slot under the session identity policy, verify fresh standing/lane evidence, show readiness and count down before resuming. When identity is not justified, require explicit rejoining; preserve the existing score without giving a spectator control. A physically changed setup requires calibration verification before readiness.

## Acceptance and open decisions

Use [the runner acceptance scenarios](../testing.md#motion-runner-acceptance-scenarios) and [M6 criteria](../roadmap.md#m6-single-player-motion-runner). They cover held lanes, return to center, boundary jitter, jump rearming, held squat, simultaneous actions, spectator interference, loss/recovery, deterministic obstacle outcomes and real-server UI evidence.

Before implementation is accepted, choose and document the minimum observation capabilities, normalization and thresholds; direct lane-transition/collision rules; jump duration and rearm policy; duck activation/release windows; resume placement; obstacle fairness and scoring. Measure false activations, missed controls and action-to-visible timing on the declared rig with varied heights and movement ranges. The delivery report records runtime software verification; physical accuracy and performance certification remain unmeasured.

## Experimental implementation choices

- `games/motion-runner/src/index.ts` owns the seeded world, 120 Hz bounded collision substeps, absolute lane selection and a single game clock. Inputs keep source time, epoch, sequence and session space revision. The simulation splits an elapsed frame at the incoming source-mapped control instant, preventing retroactive obstacle rescue. A display gap over 250 ms pauses instead of catching up.
- Speed begins at 10 m/s and gains 0.035 m/s each active second up to 18 m/s. Rows are 30 m apart, with at least one open lane. Hurdles, overhead gates and train/cart blockers are distinct. Five-coin trails guide an open lane. Score is floor(distance in meters) + 25 per coin; three hits end a run. Practice retains hit feedback without ending the run.
- Lane interpolation is 6.25 lane units/s; collision uses actual interpolated position within 0.58 lane units. Train occupancy persists across its visible longitudinal volume. A virtual jump lasts 950 ms and peaks at 1.8 m; 0.8 m clears a hurdle. Held duck selects a compact rolling model beneath the overhead gate. Camera jump requires a confirmed takeoff/landing cycle; a held key cannot repeatedly trigger jumps.
- `games/motion-runner/src/pose-controls.ts` consumes observed shoulders, hips, knees and ankles, all in-frame with score >= 0.5. Standing calibration uses shoulder-to-ankle height. Lane enter/release thresholds are 0.20/0.12 body heights; both foot lift and hip lift with 45 ms confirmation establish takeoff, and 100 ms landing rearms it. Hip/shoulder drop plus knee flexion establishes duck. The versioned exported tuning constants own exact thresholds. These are image-space heuristics, not calibrated room geometry or measured participant thresholds.
- A camera facing the participant maps decreasing image x to screen-right through one explicit control transform; anatomical joint names stay unchanged. Rehearsal emits display-relative absolute lanes directly. No camera preview or mirrored image is shown in this runner.
- Standing is explicit evidence, independent of the one-frame jump event. Before camera start, countdown or recovery, both feet must be within 0.035 body heights of their individual baselines, hips within 0.07, shoulders within 0.09, and both knees at least 150 degrees for 100 ms. Airborne followups cannot complete standing practice or start/resume merely because the jump event has ended. These normalized tolerances remain proposed pending physical trials.
- The app binds one confident canonical track through `SinglePlayerSession`; more than one detected person pauses even if the original track is confident. Same-owner fresh standing evidence permits a two-second recovery countdown. Identity, source, transform or long continuity loss requires a new run. Recovery clears transient actions and moves pending hazards together to at least 26 m ahead, preserving authored spacing without an immediate collision.
- The app owns native camera selection and acknowledged scoped release. Packet metadata is decoded without creating camera-image bitmaps. Pose practice is required before camera play. WebGL, not pose reconstruction, supplies visual 3D; Three.js is bundled locally. No remote render assets are fetched.

Run `pnpm benchmark:runner` for the declared 24 camera-free oracle cases (two worlds, four seeds and 30/60/120 Hz input over 60 active seconds). [The committed results](../../reports/motion-runner-results.json) distinguish synthetic pattern solvability and pause invariants from human difficulty or physical measurements.

## Reference benchmark and remaining gates

Official gameplay footage was inspected for chase-camera framing, three-lane depth, coin trails, readable blocker types and character silhouette. The self-contained report compares accepted reference frames with real local-server gameplay and seeded simulation results. This is a bounded experimental implementation, without commercial-game content breadth, powerups, missions, chase AI, rooftop routes or production animation/audio. It does not establish commercial parity or a perfect physical-control score.

Physical gates remain: repeat comfortable calibration across heights/movement ranges, measure false jump/duck activations and missed controls, validate spectator occlusion with actual cameras, establish framing/lane reach and safe jump clearance, and measure externally observed action-to-display latency. Synthetic software tests cannot close those gates.

A separate [render timing harness](../../scripts/fixtures/runner-render-benchmark.html) runs through the real Vite server using synthetic controls. Serve it through Vite’s allowed repository-file route, keep its browser tab visible at 1440×1000, and choose Run all four cases. [Committed short-run results](../../reports/motion-runner-render-results.json) report actual canvas sizes, visibility, phase counts, interruptions, requestAnimationFrame intervals and CPU state-copy/render-submission time. These exclude the full GUI, camera/inference and verified display/physical latency.
