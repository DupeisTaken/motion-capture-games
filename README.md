# Motion capture games

A collection of local games played through body movement, with immediate feedback over a mirrored live camera image.

**Status: documentation foundation plus an isolated XYZ experiment.** There is no runnable camera/game application or selected pose model. The [two-camera XYZ experiment](docs/player-xyz-experiment.md) now provides camera-free reconstruction, tests and synthetic measurements; hardware accuracy and physical latency remain unverified.

## Agreed scope

- A digital mirror: live camera video with graphics and sound.
- Two USB cameras advertised as 4K at 60 fps; exact models and formats are unverified.
- Start gameplay with one player and build toward three simultaneous players.
- Support free movement, crossing, overlap, and explicit recovery when identity is uncertain.
- Target Windows and macOS. A Windows machine with an RTX 3070 is the proposed reference rig; integrated graphics require separate validation.
- Run gameplay locally and offline after installation.

## Read first

| Document | Purpose |
| --- | --- |
| [Product scope](docs/product-scope.md) | Requirements, game sequence, and exclusions |
| [Architecture](docs/architecture.md) | Runtime boundaries, ownership, and provisional stack |
| [Coordinates and timing](docs/coordinates-and-timing.md) | Observation semantics, transforms, clocks, and replay |
| [Multiplayer](docs/multiplayer.md) | Joining, identity, uncertainty, and crossing scenarios |
| [Installation](docs/installation.md) | Camera placement, calibration, USB constraints, and hardware profiles |
| [Testing](docs/testing.md) | Acceptance gates, measurements, and verification expectations |
| [Roadmap](docs/roadmap.md) | Issue-ready milestones and completion criteria |
| [Decision index](docs/decisions/README.md) | Accepted decisions and proposals awaiting evidence |
| [Contributing](CONTRIBUTING.md) | Tooling direction and review workflow |
| [Agent instructions](AGENTS.md) | Rules for automated contributors |
| [Foundation report](reports/foundation.html) | Standalone change report and verification record |
| [Player XYZ experiment](docs/player-xyz-experiment.md) | Stereo algorithms, reproducible measurements and pending physical gates |
| [XYZ experiment report](reports/xyz-experiment.html) | Self-contained results and limitations |

## Repository map

```text
apps/mirror/                 Mirror application and operator interface
services/vision/             Camera acquisition, inference, tracking, and media output
packages/motion/             Model-independent motion processing
packages/session/            Player slots and session lifecycle
packages/diagnostics/        Health and timing presentation
games/                      Individual game modules
contracts/                  Shared message design and future canonical schemas
configs/installations/      Shareable rig and calibration configuration
configs/performance-profiles/ Validated settings and capacity per hardware profile
models/manifests/            Model provenance and future artifact manifests
tests/                      Cross-component verification and synthetic fixtures
docs/                       Owning design documents and decisions
reports/                    Shareable, self-contained change reports
```

Most component directories contain ownership notes. `services/vision/xyz` and `experiments` now contain the isolated geometry experiment. Add further modules when their milestone begins; avoid speculative packages and generic utility folders.

## Next milestone

Build the [diagnostic mirror experiment](docs/roadmap.md#m1-diagnostic-mirror-and-hardware-experiment) before polishing a game. Validate camera formats, the video path, and three-player crossings early enough to change the design.

The isolated Python experiment can be run with `python3 tools/project.py setup`, then `check`, `experiment` and `build`. See [the experiment commands](docs/player-xyz-experiment.md#reproducing-the-experiment). These do not launch camera capture or a game; the diagnostic mirror milestone remains open.

## Repository hosting

The repository is hosted at [DupeisTaken/motion-capture-games](https://github.com/DupeisTaken/motion-capture-games), configured locally as `origin`. The initial remote history and [MIT license](LICENSE) are preserved alongside the foundation.

The local milestone briefs and GitHub templates are ready to use. [Issue #4](https://github.com/DupeisTaken/motion-capture-games/issues/4) tracks the XYZ experiment; other work is listed in the repository's issues. Branch protection is unverified. The foundation report records the earlier local-only setup.
