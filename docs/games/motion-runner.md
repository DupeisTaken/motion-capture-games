# Single-player motion runner

## Status and scope

A manual pause offers one prominent **Resume** button inside the rendered game screen. It receives focus once for Enter/Space and supports one click or tap. One press waits for fresh standing input and the existing two-second countdown, then returns focus to the game without repeating setup/practice. Activation cannot also jump, roll or change lanes. Graphics loss, hidden presentation and identity/source changes keep their existing recovery gates. [The resume report](../../reports/game-resume.html) records verification.

Experimental playable implementation at `runner.html`, requested before physical M1/M6 certification. Neon Rails and Gold Rush share a deterministic three-lane game engine, with original procedural 3D worlds and Nova, Moss and Ember skins. Subway Surfers and Talking Tom Gold Run are gameplay references; their code, characters and assets are not dependencies.

The camera-free software slice implements the rules below. The existing canonical observation/session boundary supplies experimental camera controls. Numeric tuning is proposed and synthetic-tested; physical accuracy, body-size/reach coverage, exposure timing and end-to-end latency remain open milestone gates. [Issue #39](https://github.com/DupeisTaken/motion-capture-games/issues/39) / [PR #44](https://github.com/DupeisTaken/motion-capture-games/pull/44) tracks implementation; [the delivery report](../../reports/motion-runner-game.html) records actual verification and limitations.

## Presentation and player admission

- Show a runner advancing automatically through a scrolling world. Physical running in place and forward travel are not required controls.
- Provide three virtual lanes: left, center and right. The player moves within a bounded physical play area; the avatar supplies forward travel.
- Show a rendered game world during play. An optional mirrored learning preview below the world shows camera pixels, calibrated lane bands, head-height guides and recognized actions. It shares the existing vision stream and never replaces the game world.
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

The standing torso position sets the center lane. The three visible bands are each one calibrated shoulder width, with hip width as a fallback if one shoulder is hidden. The two internal boundaries are half a lane width from center, with a margin of 10% of a lane width on either side to prevent jitter. A player who steps beyond the outer guides stays in the outer lane while tracking remains usable. Returning from either side selects center. Direct left-to-right movement selects the new band without queued relative steps.

Lane selection remains available during a jump or duck when its required evidence is valid. Jump and duck are mutually exclusive vertical states. If vertical evidence conflicts, issue no new vertical transition; if required evidence cannot establish a usable state, enter the pause policy below. Do not turn a squat, landing compression or isolated head movement into a jump. Squat depth and jump detection must suit the participant's comfortable movement range.

## Calibration and practice

1. Verify camera framing and a clear play area for lateral steps, overhead clearance, landing and squatting. Keep the player away from the display and nearby people.
2. Start camera explicitly while the intended player is alone. The session binds that confident track; detection order never chooses a replacement. Set a comfortable **standing reference** with head, shoulders and hips visible. Legs improve scale estimation but are optional. Spectators may enter after binding.
3. Use the learning preview: camera image, calibrated lane bands, recognized lane/action, head marker and jump/standing/roll lines. Numeric text labels accompany green/white/amber guides. The six movement progress marks are optional and never block Start.
4. Keep at least one calibrated shoulder and hip observed, plus a current shoulder or hip pair for lateral position. Face landmarks supply head height; calibrated shoulders are the announced fallback during turns. Occluded, uncertain or stale controls show guidance and cannot score.
5. Choose **Start run** explicitly. A request made before calibration or standing confirmation shows the next step inside the game stage. It starts the countdown once at least 100 ms of fresh standing evidence is confirmed. **Cancel start** clears the pending request. Recalibrate when camera geometry changes. New run clears the binding and requires a new standing reference.

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
- Speed begins at 10 m/s by default. The opt-in **Fast start** switch opens at 14 m/s instead; its boolean value is snapshotted in `RunnerOptions`, locked throughout countdown/playing/paused, and retained when starting a new run (reload defaults off). Both profiles gain 0.035 m/s each active second up to 18 m/s. Rows are 30 m apart, with at least one open lane. Hurdles, overhead gates and train/cart blockers are distinct. Five-coin trails guide an open lane. Score is floor(distance in meters) + 25 per coin; three hits end a run. Practice retains hit feedback without ending the run.
- Lane interpolation is 6.25 lane units/s; collision uses actual interpolated position within 0.58 lane units. Train occupancy persists across its visible longitudinal volume. A virtual jump lasts 950 ms and peaks at 1.8 m; 0.8 m clears a hurdle. Held duck selects a compact rolling model beneath the overhead gate. Camera jump requires a confirmed takeoff/landing cycle; a held key cannot repeatedly trigger jumps.
- `games/motion-runner/src/pose-controls.ts` version-3 tuning uses named joints observed in-frame at score >=0.5. Comfortable standing calibration stores each visible head/shoulder/hip/ankle reference. Scale uses shoulder-to-ankle height when available, otherwise 2.6 times shoulder-to-hip height (minimum image height 0.16). No projected knee angle is required. Calibration explicitly records the participant's comfortable standing pose; it is not an automatic posture diagnosis.
- Each current vertical joint is compared with its own calibrated reference before combining deltas. Median nose/eye/ear displacement supplies head height, with calibrated shoulder displacement as an announced fallback. Newly visible landmarks cannot introduce another joint's absolute height. Lateral position uses a current hip pair, falling back to a current shoulder pair with the calibrated torso offset. When both pairs are occluded, scoring pauses rather than interpreting a single rotating hip as a side step.
- Jump requires head rise >=0.075 body heights plus shoulder and hip rise >=0.035 for 45 ms of source time. It fires once per confirmed standing-return cycle. Duck requires head drop >=0.16 and shoulder/hip drop >=0.08; release occurs below 0.09 head drop. Duck disarms jump until standing returns. Head nods alone do not jump. These image-space action proxies do not prove feet left the floor or measure room geometry.
- Standing requires head within 0.065 body heights, median shoulder displacement and median hip displacement each within 0.025, and available ankle deltas within 0.06, for 100 ms. Grouping shoulder and hip observations separately keeps small single-joint tracking fluctuations from blocking the countdown. The torso rearm band stays below the jump threshold, including during face loss. Recalibration discards the previous control sample before evaluating readiness. Missing torso, uncertain identity, stale status, duplicate samples or >350 ms source gaps clear gesture history. No queued takeoff survives loss.
- The camera control and preview use one explicit `displayX = 1 - cameraX` transform. Anatomical names stay unchanged. The preview uses the same fixed calibration center and width as lane selection, so the guides stay in place while the player moves. Rehearsal emits display-relative absolute lanes directly.
- The app binds one confident canonical track through `SinglePlayerSession({ recoveryWindowMs: 450 })`; initial binding requires one person in view. Spectators may then enter. Brief missing/tentative observations reach session ingestion and freeze scoring. Only fresh, confident evidence of the same track within the fixed 450 ms source-and-receipt deadline can recover. `expire(nowMs)` runs even without packets. Recovery clears gestures and requires fresh standing before a two-second countdown. Ambiguous/duplicate identity, changed source/space or expiry never transfers ownership. New run explicitly rebinds. Pending hazards move together to at least 26 m ahead on recovery, preserving spacing.
- The app owns native camera selection and acknowledged scoped release. The optional preview decodes JPEGs from the same packets, with at most one decode in flight and no pending image queue. Pose ingestion and source requests never await decode. Late/stale bitmaps close without drawing after hide/stop/reset/dispose. Hiding pixels leaves tracking active. WebGL supplies the game world; Three.js is bundled locally. No recording or second acquisition is introduced.

[Issue #64](https://github.com/DupeisTaken/motion-capture-games/issues/64) and [the runner controls report](../../reports/playtest-runner-controls.html) record this repair. `node scripts/verify-runner-controls.mjs` uses real Vite and synthetic HTTP/WebSocket packets without actual camera or inference. This is an explicit stack on `codex/playtest-tracking`, core API commit `f2f95d7e38c3559d5fae2f7a9a91fca8e9aa1766`, owned by tracking issue [#61](https://github.com/DupeisTaken/motion-capture-games/issues/61). Its shared implementation is inherited as a dependency and is excluded from the runner PR diff.

Run `pnpm benchmark:runner` for the declared 48 camera-free oracle cases (two worlds, both opening paces, four seeds and 30/60/120 Hz input over 60 active seconds). The benchmark writes current spectator continuity and owner-loss checks to `reports/local/runner-spectator-results.json`. [Earlier pace results](../../reports/runner-motion-pace-results.json) record the previous spectator policy. [The spectator update report](../../reports/runner-spectators.html) records current tests and before/after browser evidence.

## Reference benchmark and remaining gates

The arcade theme presents coin and hit outcomes with a feedback-pill animation and a short stage cue. Reduced motion disables these optional animations; gameplay continues to use the existing game clock and outcomes. [The polish and CI report](../../reports/ci-pr-readiness.html) records the desktop/mobile verification.

Official gameplay footage was inspected for chase-camera framing, three-lane depth, coin trails, readable blocker types and character silhouette. The self-contained report compares accepted reference frames with real local-server gameplay and seeded simulation results. This is a bounded experimental implementation, without commercial-game content breadth, powerups, missions, chase AI, rooftop routes or production animation/audio. It does not establish commercial parity or a perfect physical-control score.

Physical gates remain: repeat comfortable calibration across heights/movement ranges, measure false jump/duck activations and missed controls, validate spectator occlusion with actual cameras, establish framing/lane reach and safe jump clearance, and measure externally observed action-to-display latency. Synthetic software tests cannot close those gates.

A separate [render timing harness](../../scripts/fixtures/runner-render-benchmark.html) runs through the real Vite server using synthetic controls. Serve it through Vite’s allowed repository-file route, keep its browser tab visible at 1440×1000, and choose Run all six cases. [Current post-change short-run results](../../reports/runner-motion-pace-render-results.json) report actual canvas sizes, visibility, phase counts, interruptions, requestAnimationFrame intervals and CPU state-copy/render-submission time. These exclude the full GUI, camera/inference and verified display/physical latency.

## Articulated gait and pace follow-up

`apps/mirror/src/runner-animation.ts` samples a pure procedural rig from game elapsed time, distance, speed and actual lane interpolation. A hip/knee/ankle chain follows planted contact, toe-off and folded recovery; the arms bend at the elbows and swing opposite the legs, while the belt and shoulders counterturn. These are stylized animation parameters, not measured participant biomechanics.

The continuous stride phase is `1.8 * activeSeconds + 0.04 * distanceM`. A 0.76 m stance path uses a speed-dependent contact fraction so the planted ankle follows the moving track; the finite-difference tests cover both fixed speeds and the actual acceleration ramp. The leg chains are separate from decorative belt yaw to avoid introducing foot skating. Tests inspect actual rendered shoe vertices, forward-kinematic lengths, cycle boundaries, all skins, pause entry and renderer-history independence.

A small speed-dependent field-of-view change (up to three degrees) and lateral camera follow add movement without shake or changing collisions. System `prefers-reduced-motion` disables optional camera movement and decorative spinning, flashes and bursts; essential lane, running, jump and roll feedback remains visible. All animation derives from the game clock, so the first paused frame retains the exact prior pose and camera.

Resetting a run also restores the ready-state instructions, preventing an old pause or result message from directing a new run to Resume. Failed-start guidance remains visible until an explicit reset or a successful start.

[The timestamped gait inspector](../../scripts/fixtures/runner-gait-inspection.html) renders an exact synthetic full stride through the real renderer; it does not open cameras or claim to be a physical recording. [The follow-up HTML report](../../reports/runner-motion-pace.html) records fresh before/after GUI evidence, phase images, actual checks, post-change timing and independent review. The earlier implementation report and measurements remain historical snapshots of the previous rig.
