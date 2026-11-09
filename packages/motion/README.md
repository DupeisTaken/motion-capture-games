# Motion layer

Model-independent TypeScript helpers for the diagnostic mirror. [src/index.ts](src/index.ts) exposes:

- Canonical anatomical joint names and the skeleton bone graph.
- `containRect(image, viewport)`, `mapJoint(joint, rect, mirror)` and `mapBox(box, rect, mirror)`, so video and overlays share an aspect-preserving transform. Mapping never renames anatomical joints or clamps off-image points to a visible border.
- `isRenderableJoint(joint, threshold)` and `visibleBones(joints, threshold)`, which exclude missing, low-score and off-image endpoints rather than drawing invented connections.
- `decodeFramePacket(bytes)`, which returns validated observation metadata and the paired JPEG preview from a bounded packet.
- `ObservationOrder`, which rejects duplicate/out-of-order sequences and unexpected epochs. Call `reset(newEpoch)` after an acknowledged source change; a late packet must not revive an old stream.

The shared types are generated from [the canonical schema](../../contracts/schemas/observation.schema.json). Live, synthetic and future replay observations enter through the same parser. Diagnostic drawing eligibility is not permission to score: identity/freshness, session membership and game-specific rules still gate authoritative input.

[Behavior tests](../../tests/motion/motion.test.ts) cover transformations, confidence/missing-input handling, packet bounds and stream resets. Velocity, filtering and valid swept-motion segments remain future additions; this slice contains no game collisions or scores. Follow [coordinates and timing](../../docs/coordinates-and-timing.md).
