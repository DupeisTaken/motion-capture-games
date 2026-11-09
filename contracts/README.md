# Shared contracts

The first diagnostic slice uses [observation schema v1](schemas/observation.schema.json) as the cross-process source of truth. It describes named, normalized camera joints, visible detections, camera-track uncertainty, source clocks, model/transform provenance and processing diagnostics. It does not assign game player slots or scores. This remains an experimental diagnostic contract, not a certified gameplay input or multi-view protocol.

## Bindings and validation

- `pnpm contracts:generate` regenerates [the TypeScript binding](generated/observation.ts) from JSON Schema.
- `pnpm contracts:check` fails when checked-in bindings drift from the schema.
- [The TypeScript parser](src/validate.ts) validates boundary input using Ajv, then checks count/capacity consistency, source-time ordering, unique camera tracks and in-frame geometry. The Python service validates the same JSON Schema.
- [Synthetic examples](examples/README.md) and contract tests exercise missing/off-image joints, identity uncertainty, source resets and rejected payloads.

Nanoseconds cross JSON as decimal strings rather than JavaScript numbers, preserving integer precision. `host-read-completion` labels the camera timestamp honestly: it is not verified exposure time. Browser arrival time belongs to a separate clock domain. `calibrationId: null` explicitly means no metric room calibration; it does not imply room-coordinate accuracy.

All joint names are anatomical, before mirroring. Missing joints have null coordinates and `inFrame: false`. Off-image estimates keep their coordinates and have `inFrame: false`. A model score is not a calibrated probability. A camera track is never a session player identity. `detectedCount` is the number of current accepted detections; `capacityReached` means more people may be present beyond the detector's configured maximum.

## Diagnostic frame transport

One response packet contains a four-byte unsigned big-endian metadata-byte length, UTF-8 observation JSON, then a JPEG preview for that exact source frame. Metadata is bounded to 64 KiB and preview bytes to 2 MiB. The renderer requests another packet only after consuming the previous one, rather than accumulating a frame queue. This paired preview path is a diagnostic experiment, not a measured replacement for the proposed production media path.

[The motion decoder](../packages/motion/src/index.ts) checks framing and validates metadata before exposing it. JPEG envelope checks do not replace the browser's image decoder. Preview dimensions may be resized proportionally from the canonical image; joint coordinates remain normalized to that image, with no camera-space crop change.

Compatibility is explicit: consumers reject an unsupported `version` or unknown fields. A breaking semantic/schema change requires a version decision, regenerated bindings, updated fixtures and replay compatibility notes. Follow [coordinates and timing](../docs/coordinates-and-timing.md); broader media-clock mappings and scoring/replay policies remain M1/M2 work.
