# Mirror application

Future TypeScript application for primary-camera video, game graphics/audio, game selection and operator controls. Support camera-overlay games and the [motion runner's rendered world](../../docs/games/motion-runner.md#presentation-and-player-admission), with camera feedback for setup/practice. PixiJS and the browser runtime are provisional under [ADR 0002](../../docs/decisions/0002-provisional-runtime-and-media.md).

Compose the session and game modules here. Keep per-frame updates outside operator UI component state. Apply identical video/overlay transforms and keep text readable. Consume vision media and observations through public interfaces; do not reopen cameras independently.

The first implementation belongs to [M1](../../docs/roadmap.md#m1-diagnostic-mirror-and-hardware-experiment). There is no app, dependency manifest or start command yet.
