# Game modules

Introduce `whack-a-mole/` with the first playable slice, then fruit slicing and dodgeball as scoped milestones. Do not create three speculative implementations now.

Each game owns its short design document, required input capabilities/joints, rules, targets, scoring, tuning, assets, presentation adapter and behavior/replay tests. Expose an explicit lifecycle for initialization, simulation updates, presentation and disposal when the runtime API is implemented.

Consume motion/session interfaces. Never open cameras, import inference libraries, use vendor landmark indices or import another game's private code. Extract shared behavior only after a concrete second use. Account for per-player uncertainty, target consumption, repeat-hit rules and interaction between participants.

See [product scope](../docs/product-scope.md) and [M2 through M4](../docs/roadmap.md#m2-whack-a-mole-vertical-slice). No game code is present.
