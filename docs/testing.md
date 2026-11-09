# Testing and acceptance evidence

## Current status

The skeleton diagnostic slice has Vitest contract/motion/viewer tests, pytest vision/API/tracking tests, schema drift/type/lint/format checks, and a frontend build. A software CI workflow is configured. The viewer tests simulate DOM and I/O; real-server browser interactions/screenshots are separate evidence. Current actual results belong to [the diagnostic delivery report](../reports/skeleton-diagnostics.html), with the historical foundation checks in [the foundation report](../reports/foundation.html). Future game, hardware and physical-latency requirements below remain unverified unless explicitly recorded.

## Documentation changes

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

## UI verification

Use a real local server and screenshot the player interface on the actual mirror/display aspect ratio, plus relevant desktop/mobile operator layouts. Test each supported language. Current documentation and report are English only. Check contrast, text size at play distance, focus, keyboard/operator escape paths, non-color identity cues and clear error/recovery messages.

## Continuous integration roadmap

Introduce light documentation/contract checks with initial tooling. Add formatting, types, unit and replay tests with the first code. Add browser integration checks with a runnable application. Keep GPU/USB/physical-latency runs as explicitly identified hardware jobs or manual certification evidence; generic hosted CI does not supply that hardware.

## Release gate

A milestone closes only when its acceptance criteria in [the roadmap](roadmap.md) have evidence, required checks pass, documentation reflects the final design, and the HTML report distinguishes measured outcomes from limitations. An unresolved video-path or three-player tracking failure keeps the relevant milestone open; it does not prevent honest delivery of unrelated completed documentation work.
