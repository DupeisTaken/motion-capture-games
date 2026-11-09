# Motion layer

Future model-independent TypeScript processing for canonical joints, coordinate mapping, confidence, filtering, velocity and valid swept motion segments.

Accept live, synthetic and replay observations through the same boundary. Preserve anatomical identity and distinguish missing/stale/predicted input. Break trails across identity, epoch, time-gap or transform changes. Do not own targets, hit rules or scores.

For the [motion runner](../../docs/games/motion-runner.md#motion-and-game-boundary), expose model-independent body position and vertical/posture evidence with timestamps and validity. The runner owns lane bands and jump/duck rules. Do not introduce a shared gesture classifier or choose model-specific thresholds just for this documentation brief.

Follow [coordinates and timing](../../docs/coordinates-and-timing.md). Add behavior tests with the implementation; no package exists yet.
