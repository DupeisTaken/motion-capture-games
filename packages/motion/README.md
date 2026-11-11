# Motion layer

For [Virtual Maze](../../docs/games/virtual-maze.md), `src/maze-input.ts` validates model-independent XYZ and the explicitly selected head/torso forward vector, with identity/clock/revision/freshness/order checks. It rejects physical-origin input in this rehearsal slice. Four manually named, already-calibrated rig-floor corners support rigid metric registration with explicit scale/residual rejection; photo clicks are planning annotations. This in-process adapter does not extend the canonical wire schema or implement inference.

Model-independent TypeScript helpers for the diagnostic mirror. [src/index.ts](src/index.ts) exposes:

- Canonical anatomical joint names and the skeleton bone graph.
- `containRect(image, viewport)`, `mapJoint(joint, rect, mirror)` and `mapBox(box, rect, mirror)`, so video and overlays share an aspect-preserving transform. Mapping never renames anatomical joints or clamps off-image points to a visible border.
- `isRenderableJoint(joint, threshold)` and `visibleBones(joints, threshold)`, which exclude missing, low-score and off-image endpoints rather than drawing invented connections.
- `decodeFramePacket(bytes)`, which returns validated observation metadata and the paired JPEG preview from a bounded packet.
- `ObservationOrder`, which rejects duplicate/out-of-order sequences and unexpected epochs. Call `reset(newEpoch)` after an acknowledged source change; a late packet must not revive an old stream.
- `MotionContact` / `GameMotionFrame` and observed-contact adapters in `game-input.ts`: wrist, ankle and hip measurements, palm centers derived from confident same-side hand landmarks, and explicit feet/depth capability. Session membership and source timing are applied by `packages/session`. Game modules choose the contacts and collision rules for each interaction.
- `DodgeMotionFrame`, `observationToDodgeFrame` and `syntheticBody` in `dodgeball-input.ts`: named full-body joint evidence for the [dodgeball game](../../docs/games/dodgeball.md), validated observed coordinates and a labeled synthetic rehearsal pose. Collision shapes and scoring remain in the game module.

The shared types are generated from [the canonical schema](../../contracts/schemas/observation.schema.json). Live, synthetic and future replay observations enter through the same parser. Diagnostic drawing eligibility is not permission to score: identity/freshness, session membership and game-specific rules still gate authoritative input.

[Behavior tests](../../tests/motion/motion.test.ts) cover transformations, confidence/missing-input handling, packet bounds and stream resets. Velocity, filtering and valid swept-motion segments remain future additions; this slice contains no game collisions or scores. Follow [coordinates and timing](../../docs/coordinates-and-timing.md).

The experimental [motion runner](../../docs/games/motion-runner.md#motion-and-game-boundary) consumes canonical named joints and session source timing. Its game-owned pose controls interpret calibration, lane bands, jump, duck and confirmed standing; those runner-specific heuristics stay in games/motion-runner until another consumer demonstrates a shared primitive. Shared motion contains no runner scoring, collision or gesture thresholds.

The independent console preview also exports `decodePreviewPacket` and `canOverlay`: validate image metadata and gate display-only pose holds by source epoch, geometry and the 150 ms source-time window. They do not fabricate game input; Slap a Mole retains its exact-pair canonical observations. See [ADR 0006](../../docs/decisions/0006-independent-preview.md).
