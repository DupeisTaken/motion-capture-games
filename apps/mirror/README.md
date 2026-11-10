# Mirror application

The TypeScript diagnostic viewer renders a paired camera image and canonical skeletons with Canvas2D. It automatically shows current detected-person count, camera-local association states, source controls and diagnostic timing. It never opens cameras or imports model inference libraries.

Run `pnpm dev` at the repository root. [The viewer guide](../../docs/diagnostic-viewer.md) describes setup and controls. The display-clock frame loop keeps one decoded image, while independent image and pose streams each request their next current item after consumption; display mirroring applies equally to video and geometry. Stop/restart, missing input and source epochs invalidate old observations and image bitmaps.

Session/game composition and the production renderer/media path remain future work. [ADR 0005](../../docs/decisions/0005-diagnostic-skeleton-slice.md) limits this slice; [ADR 0002](../../docs/decisions/0002-provisional-runtime-and-media.md) still owns the larger performance experiment. Tests include simulated DOM integration and separately reported real-server screenshots.

Future game composition supports camera-overlay games and the [motion runner's rendered world](../../docs/games/motion-runner.md#presentation-and-player-admission), with camera feedback for setup/practice. The runner is planned; it is not implemented in the diagnostic viewer.

Render, camera/source and pose FPS are measured separately. Telemetry/person-list DOM work is limited to 4 Hz; overlays outside the 150 ms source-time hold window are hidden. [ADR 0006](../../docs/decisions/0006-independent-preview.md) records the tradeoff.
