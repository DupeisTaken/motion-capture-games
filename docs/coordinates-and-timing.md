# Coordinates and timing

## Status

This is the semantic design for future contracts, not a published wire protocol. Field names below establish intended meaning; the first schema implementation must version and validate the concrete representation. [Contracts](../contracts/README.md) owns that step.

## Coordinate spaces

| Space | Meaning and convention |
| --- | --- |
| Sensor image | Original camera output; retain dimensions, orientation and format metadata |
| Canonical camera image | Upright, unmirrored image after a documented orientation transform; origin at top left, x right, y down |
| Normalized camera image | Canonical x divided by width and y divided by height; usually in 0..1, with explicit out-of-frame handling |
| Display | Pixels of the composed mirror viewport after rotation, crop/fit, mirroring and layout |
| Calibrated rig world, optional | Right-handed meters: origin at floor center on the display plane, x screen-right as seen by a participant, y up, z from the display into the play area |

Preserve valid out-of-frame estimates with an explicit status; do not clamp them into a hittable screen edge. Distinguish an observation outside the image from a missing joint.

All joints use anatomical names such as `left_wrist`, independent of image mirroring. Apply mirroring once through the presentation transform. Apply the same crop, aspect-ratio policy and mirror transform to video and its overlays. UI text is laid out normally rather than mirrored with the camera texture.

Keep transforms explicit and composable. Name them `T_destination_from_source` and document column-vector multiplication. Record camera ID, image geometry, calibration ID and transform revision. A calibration or crop change invalidates incompatible motion history.

A floor-plane homography maps points on that plane; it is not a general mapping for hands and bodies at different depths. Secondary-view observations need a justified geometric mapping before use in primary-view collisions.

MediaPipe image depth is relative to the hips, and its world landmarks use the hip midpoint as origin. These model estimates are not our calibrated rig-world frame. Adapt them explicitly and preserve their provenance. [MediaPipe output definitions](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker?tab=Web)

## Draft observation semantics

Each observation envelope must identify:

- Protocol version, stream epoch, sequence and source frame ID(s).
- Camera/rig ID, calibration revision, model artifact identity and coordinate space.
- Observation time and its clock domain, host arrival time, and time uncertainty.
- Camera-local track ID and optional associated rig track ID.
- Named joints with position, source score, observation status, visibility/presence when available, and whether the joint is in frame.
- Identity-association quality, tracking state and source view(s).
- Optional body regions and provider capabilities, with their derivation documented.

A model score is not automatically a calibrated probability or spatial error estimate. Missing measurements remain missing. Distinguish observed, estimated and predicted positions so consumers can choose a justified policy.

Player-slot assignment belongs to the session layer. A camera-local or rig track ID must never be treated as a score owner without that assignment.

## Time and clock domains

Use integer nanoseconds for local monotonic timestamps (`*_ns`) in the future application contract. Preserve native media presentation timestamps with their rational time base. Wall-clock dates are useful for human reports, not elapsed simulation time.

Retain device exposure timestamps when the hardware provides meaningful ones. Otherwise label host arrival/read completion as an approximation. It does not prove when exposure occurred. Record timestamp quality and estimated uncertainty.

Backend monotonic time, camera/device time, media time and browser time are different domains. Introduce explicit mappings with offset, drift where needed, epoch and uncertainty. Do not compare timestamp numbers from different clocks directly. Camera reconnects, clock discontinuities and renderer reconnects trigger remapping and history invalidation.

The video path must retain enough timing information to associate a presented frame with observations. API support for frame metadata is useful but does not itself prove alignment; verify on the supported browser and hardware. [Video frame callback metadata](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback)

## Freshness, simulation and collisions

- Use bounded frame and observation buffers. Report observation age, queue age, dropped work, and time-mapping uncertainty.
- Define freshness and prediction limits through the measured latency budget and playtests; no numeric stale threshold is accepted yet.
- Use a controlled game timestep, injectable clock and seeded randomness. Bound catch-up work after stalls.
- Map observation time into the game timeline for collisions. If latency compensation is introduced, define its window and use the same policy in replay; avoid timing decisions based on message arrival alone.
- Compute swept motion only across valid observations of the same identity, epoch and coordinate revision, with an allowed time gap. A reacquired hand must not draw a slice across the room.
- Presentation interpolation or prediction is separately labeled and must not silently become authoritative scoring input.
- Attribute actions once. Each game defines repeat-hit, cooldown and target-consumption rules.

## Replay boundaries

Two replay levels serve different purposes:

1. **Canonical pose replay** feeds the motion layer, including timestamps, quality, identity events and coordinate revisions. It exercises filtering and conversion without cameras or inference.
2. **Game-input replay** feeds the simulation after motion processing. It is the reference for scoring reproduction within a declared game/runtime version and numeric tolerance.

Record the contract, game, motion-processing and configuration versions; seed; timestep; clock mapping; calibration/transform references; ordered join/loss/recovery events; and source-input ordering. Pose replay must also identify filter state initialization. Compare outputs under a defined tolerance rather than promising bit-identical results across arbitrary platforms or changed dependencies.

Raw video replay exercises capture/inference and has different storage and participant-data implications. Keep it local and explicitly enabled. Routine committed fixtures and reports use synthetic observations.
