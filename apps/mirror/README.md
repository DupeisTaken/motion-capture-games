# Mirror application

The TypeScript diagnostic viewer renders an independent camera image and source-timed canonical skeletons with Canvas2D. It automatically shows current detected-person count, camera-local association states, source controls and diagnostic timing. It does not acquire diagnostic frames or import inference libraries. Explicit browser discovery and temporary identification can open a setup-only stream; its tracks are released before Python capture starts. Browser IDs are never guessed to be native indices.

Run `pnpm dev` at the repository root. [The viewer guide](../../docs/diagnostic-viewer.md) describes setup and controls. The display-clock frame loop keeps one decoded image, while independent image and pose streams each request their next current item after consumption; display mirroring applies equally to video and geometry. Stop/restart, missing input and source epochs invalidate old observations and image bitmaps.

`mole.html` now composes the experimental [Mole Motion game](../../docs/games/mole-motion.md), game-ready motion contacts and one explicit session slot. `mole-viewer.ts` owns controls, bounded camera packet delivery and labeled synthetic rehearsal; `mole-renderer.ts` shares contain/mirror geometry between video, targets and contacts. The production renderer/media path remains future work. [ADR 0005](../../docs/decisions/0005-diagnostic-skeleton-slice.md) limits the camera transport; [ADR 0002](../../docs/decisions/0002-provisional-runtime-and-media.md) still owns the larger performance experiment. Tests include simulated DOM integration and separately reported real-server screenshots.

`camera-release.ts` retains acknowledged source epochs until their scoped stop is acknowledged. Failed HTTP/network cleanup remains visible and retryable across source selection; an ended preview does not prove driver release. Game readiness gates both Start and Resume, and track options preserve native selection state while reporting the actual joined owner.

Future game composition supports camera-overlay games and the [motion runner's rendered world](../../docs/games/motion-runner.md#presentation-and-player-admission), with camera feedback for setup/practice. The runner is planned; it is not implemented in the diagnostic viewer.

Render, camera/source and pose FPS are measured separately. Telemetry/person-list DOM work is limited to 4 Hz; overlays outside the 150 ms source-time hold window are hidden. [ADR 0006](../../docs/decisions/0006-independent-preview.md) records the tradeoff.

Operator telemetry updates at most four times per second, using a bounded 120-pose window. Person rows change only when displayed identity/joint-count/capacity information changes; the canvas draws on its independent display clock. Controls, stage timings and stream context share one responsive page. See [the console report](../../reports/diagnostic-console.html) for actual measurements and verification.
