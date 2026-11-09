# Session runtime

Future TypeScript owner of anonymous player slots, joining/leaving, session time, practice/countdown, playing, pause, results and restart.

Keep per-player input quality separate from global session state. Check game/profile capabilities and player admission limits. Preserve scores through uncertain tracks, and bind a recovered track to a slot only under a justified policy. Game-specific scoring stays with the game.

Game capacity is independent of visible-person count and hardware capacity. The [motion runner](../../docs/games/motion-runner.md#presentation-and-player-admission) permits exactly one joined slot; additional detections do not join or take over control. Its uncertainty policy pauses world progression and scoring until explicit recovery.

See [multiplayer](../../docs/multiplayer.md) and [architecture](../../docs/architecture.md). No package or state machine is implemented yet.
