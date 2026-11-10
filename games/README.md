# Game modules

[`mole-motion/`](mole-motion/src/index.ts) implements the first experimental single-player whack-a-mole slice. Its [owning design](../docs/games/mole-motion.md) specifies touch/push capabilities, four play modes, tuning and recovery. Fruit slicing and dodgeball remain scoped milestones. A single-player `motion-runner/` is also planned; its [design brief](../docs/games/motion-runner.md) owns lane, jump and duck semantics.

Each game owns its short design document, required input capabilities/joints, rules, targets, scoring, tuning, assets, presentation adapter and behavior/replay tests. Expose an explicit lifecycle for initialization, simulation updates, presentation and disposal when the runtime API is implemented.

Consume motion/session interfaces. Never open cameras, import inference libraries, use vendor landmark indices or import another game's private code. Extract shared behavior only after a concrete second use. Account for per-player uncertainty, target consumption, repeat-hit rules and interaction between participants. Declare each game's player limit, input capabilities and presentation mode. The runner admits exactly one session slot and owns its lane selection, jump/duck state, obstacles and scoring; it consumes model-independent body motion rather than camera pixels.

See [product scope](../docs/product-scope.md), [M2 through M4](../docs/roadmap.md#m2-whack-a-mole-vertical-slice) and [M6: motion runner](../docs/roadmap.md#m6-single-player-motion-runner). `MoleGame` exposes start/update/pause/resume/finish/restart and immutable snapshots. `replayGame` consumes version-1 seeded commands and canonical game frames; it reproduces software outcomes without a camera. This does not establish physical recognition or measured latency.
