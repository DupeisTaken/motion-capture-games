# Single-player motion runner

## Status and scope

Planned game in the documentation scaffold; no runtime or gesture recognition is implemented. The agreed interaction is one person controlling an on-screen runner through left, right, center, jump and squat movements. Temple Run / Subway Surfers are gameplay references, not dependencies or an integration target. Use an original game world and assets.

This brief owns the runner's intended behavior. The three-lane mapping, squat-to-duck behavior and recovery rules below are the initial design; recognition algorithms, numeric thresholds, action durations, speed, scoring formula and obstacle generation remain proposals to validate. Implementation belongs to [M6](../roadmap.md#m6-single-player-motion-runner), after the relevant diagnostic and session gates.

## Presentation and player admission

- Show a runner advancing automatically through a scrolling world. Physical running in place and forward travel are not required controls.
- Provide three virtual lanes: left, center and right. The player moves within a bounded physical play area; the avatar supplies forward travel.
- Show a rendered game world during play. Setup/practice may include mirrored camera feedback, lane guides and recognized-action cues. Text stays readable and is never mirrored with video.
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

Candidate signals include named hip/shoulder positions for body center, torso/leg posture for squatting, and temporally consistent body/foot evidence for jumping. The minimum capability set and treatment of temporarily hidden joints require trials; no vendor joint indices, image-pixel cutoffs, trained classifier or numeric threshold is chosen here. Store selected thresholds, units, normalization and rationale in versioned configuration with replay evidence.

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

Before implementation is accepted, choose and document the minimum observation capabilities, normalization and thresholds; direct lane-transition/collision rules; jump duration and rearm policy; duck activation/release windows; resume placement; obstacle fairness and scoring. Measure false activations, missed controls and action-to-visible timing on the declared rig with varied heights and movement ranges. No runtime, physical accuracy or performance result is claimed by this brief.
