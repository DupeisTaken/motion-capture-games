# Motion capture games

A collection of local games played through body movement, with immediate feedback over a mirrored live camera image.

**Status: documentation foundation.** There is no runnable application, selected pose model, installed toolchain, or measured performance result yet. This repository establishes the design and contribution rules before implementation.

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
| [Vision research and plan](docs/vision-research.md) | Location, motion, pose algorithms, training decisions and M1 experiment plan |
| [Vision research report](reports/vision-research.html) | Standalone, source-linked research and delivery verification |
| [Contributing](CONTRIBUTING.md) | Tooling direction and review workflow |
| [Agent instructions](AGENTS.md) | Rules for automated contributors |
| [Foundation report](reports/foundation.html) | Standalone change report and verification record |

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

The component directories currently contain ownership notes, not implementation stubs. Add modules when their milestone begins; avoid speculative packages and generic utility folders.

## Next milestone

Build the [diagnostic mirror experiment](docs/roadmap.md#m1-diagnostic-mirror-and-hardware-experiment) before polishing a game. Validate camera formats, the video path, and three-player crossings early enough to change the design.

Setup, development, build, and test commands will be introduced with the first runnable slice. No command in this document claims an application already exists.

## Repository hosting

The repository is hosted at [DupeisTaken/motion-capture-games](https://github.com/DupeisTaken/motion-capture-games), configured locally as `origin`. The initial remote history and [MIT license](LICENSE) are preserved alongside the foundation.

The local milestone briefs and GitHub templates are ready to use. [Issue #1](https://github.com/DupeisTaken/motion-capture-games/issues/1) tracks the vision research and plan. No branch protection configuration is claimed here. The foundation report records the earlier local-only setup.
