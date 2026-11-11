# Testing and acceptance evidence

## Current status

The skeleton diagnostic slice has Vitest contract/motion/viewer tests, pytest vision/API/tracking tests, schema drift/type/lint/format checks, and a frontend build. A software CI workflow is configured. The viewer tests simulate DOM and I/O; real-server browser interactions/screenshots are separate evidence. Current actual results belong to [the diagnostic delivery report](../reports/skeleton-diagnostics.html), with the historical foundation checks in [the foundation report](../reports/foundation.html). Future game, hardware and physical-latency requirements below remain unverified unless explicitly recorded.

The runner documentation update has its own [change report](../reports/motion-runner.html). Its acceptance scenarios below remain future implementation requirements.

The experimental [Slap a Mole slice](games/mole-motion.md) adds game rules/replay, motion contacts, one-slot membership and operator UI tests. [Its report](../reports/mole-motion.html) records actual check results and English desktop/mobile real-server screenshots. Required scenarios cover timed/challenge/survival/practice outcomes, wrist/foot touch and hip push rehearsal, forward-miss/repeat-hit rearming, hard placement/bounds, stale/order/clock/identity/geometry gaps, hidden-tab/framing pause, camera decode/start/stop races and restart. Calibrated depth, camera hit/framing accuracy, participant reach, physical latency and multiplayer remain hardware gates.

The experimental [Dodgeball slice](games/dodgeball.md) adds seeded warning/danger obstacle outcomes, visible head/torso/limb collision regions, full-body confidence validation, mode and replay tests, and operator UI coverage. [Its report](../reports/dodgeball.html) records actual results. Required cases include missing ankles and upper-body joints, body/ball boundary contact, repeated outcomes, stale/clock/identity changes, interruption during danger, explicit countdown recovery and results/restart. Physical height/position playtests and camera accuracy remain open.

## Documentation changes

The [camera-free XYZ experiment](player-xyz-experiment.md) adds tests for all three methods, strict metadata/provenance, degeneracy, missing/out-of-frame joints and calibration/time/identity rejection. The benchmark reports requested-joint coverage, raw/accepted error, unsafe acceptance and separate serial stage timings. `pnpm verify:vision` exercises real synthetic-service HTTP/WebSocket transport and captures the responsive English viewer. [The #3/#4 report](../reports/vision-issues.html) owns actual checks; physical XYZ and camera/model certification remain open.

Check Git whitespace, local Markdown links/anchors, HTML document structure, and any structured examples. Verify that accepted requirements, proposals, measurements and unrun checks are labeled consistently. Validate HTML reports from a local HTTP server at desktop and mobile widths; reports must work offline without external assets.

## Behavior tests to introduce with implementation

| Layer | Meaningful scenarios |
| --- | --- |
| Contracts | Invalid values, missing joints, version incompatibility, epoch changes, timestamp units and generated-client drift |
| Motion | Mirror/crop mapping, anatomical left/right, stale observations, uncertainty, variable sample intervals and trail breaks |
| Session | Explicit join/leave, capacity admission, lost identity, reacquisition, reconnect, pause/resume and score ownership |
| Games | Seeded scoring replay, swept collisions, repeat-hit rules, tracking gaps and per-player attribution |
| Vision adapters | Joint mapping, visibility semantics, dropped frames, camera disconnects and model/provider failure |
| Integration | Observation/video alignment, bounded backpressure, source clocks, configuration rejection and offline startup |

Tests should exercise behavior and failure modes rather than mirror implementation details. A model adapter's unit tests do not establish field accuracy. Camera-free replay checks do not certify an installation.

## Performance targets

These are proposed acceptance targets for the reference rig. Validate or revise them through an explicit decision, with measurements and product implications.

| Metric | Initial target | Evidence method |
| --- | --- | --- |
| Rendering | Stable 60 Hz presentation | Frame-time distribution, missed-frame count and visible smoothness under declared workload |
| Pose updates | At least 30 useful updates/s per active player | Per-player valid observation intervals, with quality and view count reported |
| Motion-to-visible feedback | p95 below 100 ms | External high-frame-rate recording or equivalent instrumented physical measurement |
| Video/pose alignment | Tolerance to be chosen in M1 | Joint-to-image displacement and presentation-time skew during fast movement |
| Freshness | Limits to be chosen in M1 | Capture/arrival/queue/processing timing with clock quality recorded |
| Capacity | One first; three on a certified profile | Full capture/inference/rendering workload and crossing scenarios |

Do not infer end-to-end latency by adding stage percentiles: the percentile of a sum is not generally the sum of percentiles. Trace correlated samples where possible and measure visible feedback externally. Report p50/p95/p99 where useful, sample count, test duration and warm-up treatment. Mark unmeasurable stages explicitly.

Measure capture/decode, preprocessing, detection, per-person pose estimation, tracking, view association, transport, simulation, composition and display. Include host/device/media clock uncertainty, dropped frames, CPU/GPU load and memory trends. Serialize heavy runs and avoid background workloads owned by this task.

## Multiplayer and recovery

Run the scenarios in [multiplayer](multiplayer.md#required-diagnostic-scenarios) at one and three participants on each capacity profile being certified. Predetermine repetitions and coverage, then report the actual count. Include wrong associations, correctly suspended ambiguity, recovery time, per-player lost-joint duration and wrong-slot scoring events.

The target is no observed wrong-slot scoring in the agreed repeatable scenario set. A pass is scoped to that set and rig; it is not a guarantee against all complete occlusions. If there is no reliable evidence of identity, verify that affected input is suspended rather than guessed.

Test camera unplug/replug, source restart, clock discontinuity, profile change, calibration invalidation, out-of-order/stale messages, spectator entry and a disappearing/reappearing player. Verify score retention and motion-trail reset.

## Motion runner acceptance scenarios

These [M6](roadmap.md#m6-single-player-motion-runner) requirements have an experimental synthetic software implementation. Runner game/motion/viewer tests cover the bounded software behavior; physical accuracy and latency remain uncompleted gates. [The delivery report](../reports/motion-runner-game.html) identifies actual checks. Use synthetic canonical pose input and game-input replays before physical trials; identify the rig/profile for recognition and timing measurements.

| Area | Required scenarios and evidence |
| --- | --- |
| One-player admission | A second join is rejected; spectator entry/exit and crossing leave gameplay running when the joined track stays confident. The controlling slot and score stay with that track. Ambiguous identity pauses the runner. |
| Lane selection | Left/center/right holds, return from either side to center, direct side-to-side movement, boundary jitter and different body sizes/depths. A held lane produces no repeated relative shifts. Check the same participant-relative mapping with mirrored practice video and rendered-world gameplay. |
| Jump | One event per valid takeoff/landing cycle; repeated samples, small bobbing, squatting, missing feet and landing gaps cannot invent a second jump. Lane changes during a jump follow the documented rule. |
| Squat/duck | Enter, hold and release; distinguish crouching from tracking loss, leaning, head motion and jump preparation/landing. No repeated rewards from a held squat. Conflicting vertical evidence produces no invented action. |
| Obstacles and timing | Seeded low/overhead/lane obstacle cases, collision windows, any simultaneous inputs, and observation timestamps mapped into the simulation clock; reordered, delayed or duplicate input cannot change an already consumed action. |
| Loss and recovery | Missing/stale required joints, uncertain identity, camera disconnect, out-of-area motion, pause mid-jump/duck, epoch/clock/transform changes and calibration invalidation. World progression, collisions, distance and score remain frozen; recovery resets history, requires readiness and never fast-forwards hazards. |
| Physical trials and UI | Per-control false activations, missed actions and action-to-visible timing with sample counts and configuration; varied heights/reach and safe lateral/jump/squat space. Real-server rendered-world, calibration, practice and recovery screenshots at supported display/operator sizes, English initially. |

Recognition thresholds, hysteresis, action timing, supported capabilities and difficulty need measured evidence before acceptance. A docs check or synthetic replay does not establish physical jump/squat accuracy.

## Virtual maze acceptance scenarios

The [M7 design](games/virtual-maze.md) introduces camera-free software rehearsal. [Its delivery report](../reports/virtual-maze.html) owns actual results. The following matrix is the acceptance scope; entries are not claims that a test or physical trial has run.

| Area | Required scenarios and evidence |
| --- | --- |
| Dimensions and generation | Independent 5/10 m endpoints, asymmetric rectangles, invalid/nonfinite/out-of-range dimensions; Easy/Medium/Hard and repeat seeds; connected cells, closed outside perimeter, reproducible start/goal/walls and metric layout. |
| Internal loops | Cycles exist when requested; BFS reaches the chosen interior goal; exact canonical left/right-hand cell algorithms from the declared initial heading repeat a `(cell, heading)` state without finding that goal. Compare loops-off behavior. Test across a declared seed/difficulty/dimension set, with bounded generation work. A loop count alone is not acceptance. |
| Directional signal | Ray hits/parallel rays, intersections at wall endpoints, near-wall/clear-corridor intensity, turning in place, opposite head/torso headings and walls behind the player. Geometry/audio/display share the same normalized output. |
| Position and selected facing | Finite metric XYZ, selected floor-projected forward vector, zero/vertical/nonfinite/missing direction, backward motion and stationary rotation. Head selection cannot use torso when head is absent. Missing position/heading must never produce clear-space feedback. |
| Registration | Four correctly named metric corners, rigid rotation/translation, each 5..10 m configured dimension, reversed/bow-tie/duplicate/degenerate corners, bad metric scale/side length and excessive residual. Image photo points remain normalized planning annotations and cannot satisfy physical readiness. |
| Time and identity | Stale/future input, uncertainty crossing age/future limits, duplicate/out-of-order source sequence/time, wrong clock/track/slot/epoch/calibration, unconfirmed identity and physical-origin input. Outcomes/intensity freeze or become unavailable consistently; no guessed ownership/revision recovery. |
| Lifecycle and outcomes | Shared setup opens on load and every New round; Close/Escape preserves the paused current round and draft choices; only valid Start round confirmation applies a candidate atomically. Native invalid fields stay in setup with focus; missing input cannot block reopening setup. Pause/Resume preserves current position, layout and active facing. Popup controls, hidden confirmation and pending audio cannot bypass setup. Verify goal/new-round cancellation, BFCache and final disposal. Repeat `generateMaze` configurations and `sampleMaze` endpoint inputs at the same code revision for deterministic outcomes. Endpoint queries do not implement swept collision, blocked traversal, scoring or command replay. |
| Operator/participant UI | Shared two-column Video & input / Game settings dialog, centimetre dimension entry, seed/difficulty/loops/orientation drafts and a separate active-map readout; independent heading and position rehearsal; readiness fixtures; participant view without maze, route or coordinates; inline alternative, popup blocked/closed and resized displays; keyboard/touch and non-color state cues. Verify the camera placement schematic, disclosure/guide, scrollable mobile setup and fixed confirmation controls at desktop/mobile/narrow English widths. Guidance or photo labels cannot enable physical input. |
| Audio | Explicit enable and unavailable-context handling, normalized gain cap, monotonic intensity response and silence on invalid input, pause, hidden/blurred presentation or participant-window loss. Synthetic/browser checks verify software state, not measured loudness or acoustic latency. |
| Physical trials: open | Independent held-out corner/root/angular/clearance ground truth; calibration/remount repetitions, lighting/color/occlusion variations, head/torso disagreement, stationary turns/backward walking, boundaries and operator stop/recovery. Measure accepted error plus coverage/rejections, useful update intervals and external motion-to-buzzer latency on the actual rig. |

Use synthetic fixtures and the existing environment; no participant footage, local planning photo or private device identifiers enter the committed report. Serialize browser verification and heavy test/build work. English desktop/mobile and map-free participant screenshots must come from the real `/maze.html` server. The existing [physical XYZ protocol](player-xyz-experiment.md#physical-validation-protocol-open) supplies position evidence requirements; orientation and buzzer perception require additional measurements. Neither software CI nor the planning photo closes physical M1/M7.

## UI verification

Use a real local server and screenshot the player interface on the actual mirror/display aspect ratio, plus relevant desktop/mobile operator layouts. Test each supported language. Current documentation and report are English only. Check contrast, text size at play distance, focus, keyboard/operator escape paths, non-color identity cues and clear error/recovery messages.

## Continuous integration

Follow [CI conventions](continuous-integration.md) for exact commands and component/build coverage. Every PR runs repository documentation/whitespace checks and TypeScript/Python checks plus app builds on Ubuntu, Windows and macOS. The stable `software-checks` gate requires all lanes to succeed. Independently distributed packages must add output/clean-install tests when introduced. Current DOM tests do not replace real-server browser evidence. Keep GPU/USB/physical-latency runs as explicitly identified hardware jobs or manual certification evidence; generic hosted CI does not supply that hardware.

## Release gate

A milestone closes only when its acceptance criteria in [the roadmap](roadmap.md) have evidence, required checks pass, documentation reflects the final design, and the HTML report distinguishes measured outcomes from limitations. An unresolved video-path or three-player tracking failure keeps the relevant milestone open; it does not prevent honest delivery of unrelated completed documentation work.
