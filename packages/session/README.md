# Session runtime

`src/index.ts` implements one explicitly joined anonymous `player-1` slot for the experimental [Mole Motion slice](../../docs/games/mole-motion.md). `SinglePlayerSession.join` binds one selected confident track; `ingest` validates that binding and maps source timing with bigint deltas; `release` leaves. Detection order and screen position never enroll anyone. Lost/uncertain membership or changed source geometry requires explicit rejoin. A different track changes the association revision, so the game requires a new round rather than transferring an old score.

Keep per-player input quality separate from global session state. Check game/profile capabilities and player admission limits. Preserve scores through uncertain tracks, and bind a recovered track to a slot only under a justified policy. Game-specific scoring stays with the game.

Game capacity is independent of visible-person count and hardware capacity. The [motion runner](../../docs/games/motion-runner.md#presentation-and-player-admission) permits exactly one joined slot; additional detections do not join or take over control. Its uncertainty policy pauses world progression and scoring until explicit recovery.

The game currently owns its active round/countdown clock and pause/results lifecycle; this shared session layer owns membership and source validity. Initial transport delay is unmeasured, and the source clock mapping is not exposure synchronization. Hardware association remains experimental; three-player sessions and automatic identity recovery are unimplemented. See [multiplayer](../../docs/multiplayer.md) and [architecture](../../docs/architecture.md).
