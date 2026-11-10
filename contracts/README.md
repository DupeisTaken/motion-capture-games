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

The smooth viewer pulls independent `/api/preview` images and `/api/observations` JSON poses. [Preview schema v1](schemas/preview.schema.json) owns the image’s epoch, sequence, source clock, geometry and measured capture rate; [its generated binding](generated/preview.ts) is checked alongside observations. Both images and observations retain their own actual source timestamps. The browser’s display-only overlay gate permits a held pose only for matching source/epoch/geometry with a 0–150 ms gap. This is not exact-frame alignment or scoring authorization.

The original `/api/stream` remains compatible: four-byte big-endian metadata-byte length, UTF-8 observation JSON, then a JPEG for that exact observation image. Independent preview packets use the same byte framing with preview metadata instead. Metadata is bounded to 64 KiB and JPEG to 2 MiB; each endpoint has at most one pending response per client. A client explicitly chooses its endpoint/schema and rejects unsupported versions or unexpected fields.

[The motion decoders](../packages/motion/src/index.ts) validate framing and metadata. The browser checks decoded image dimensions. The service compiles the canonical JSON Schema once with fastjsonschema instead of interpreting it on each publication, while retaining cross-field checks. No separately hand-maintained observation model is introduced. Boundary tests compare compiled validation against the reference validator.

Broader media-clock mappings, gameplay freshness and scoring/replay policies remain M1/M2 work. See [coordinates and timing](../docs/coordinates-and-timing.md) and [ADR 0006](../docs/decisions/0006-independent-preview.md).
