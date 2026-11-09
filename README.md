# Motion capture games

A collection of local games played through body movement, with immediate on-screen feedback in a mirrored camera view or a rendered game world.

**Status: runnable skeleton diagnostic slice.** A Python vision service and TypeScript viewer render body skeletons and automatically count current detections. MediaPipe and RTMDet/RTMPose adapters, two association modes and labeled synthetic input are implemented. Production model selection, game scoring, multi-view reconstruction and hardware certification remain open.

## Run the diagnostic viewer

Use Node 24.21.0, pnpm 11.25.0, and an existing Python 3.9+ interpreter for the local bootstrap:

```text
pnpm install --frozen-lockfile
pnpm setup
pnpm dev
```

Open **http://127.0.0.1:5173**. Choose **Camera** and **Start camera**, or choose **Synthetic scene** to inspect generated bodies without camera access. Setup downloads pinned Python tools and verified model artifacts locally; preview inference works offline afterward. Nothing opens a camera until explicitly started. See [the viewer guide](docs/diagnostic-viewer.md) for controls, commands and limitations.

## Agreed scope

- A digital mirror: live camera video with graphics and sound for camera-overlay games; a rendered world for the motion runner.
- Two USB cameras advertised as 4K at 60 fps; exact models and formats are unverified.
- Start gameplay with one player and build toward three simultaneous players.
- Add a single-player motion runner: move left, center or right to choose a lane, jump to clear low obstacles, and squat to duck overhead obstacles. Its player limit stays at one.
- Support free movement, crossing, overlap, and explicit recovery when identity is uncertain.
- Target Windows and macOS. A Windows machine with an RTX 3070 is the proposed reference rig; integrated graphics require separate validation.
- Run gameplay locally and offline after installation.

## Read first

| Document | Purpose |
| --- | --- |
| [Product scope](docs/product-scope.md) | Requirements, game sequence, and exclusions |
| [Motion runner brief](docs/games/motion-runner.md) | Single-player lanes, jump/duck controls, recovery and validation |
| [Architecture](docs/architecture.md) | Runtime boundaries, ownership, and provisional stack |
| [Diagnostic viewer](docs/diagnostic-viewer.md) | Setup, skeleton rendering, automatic counts, algorithms and recovery |
| [Tracking algorithms](docs/tracking-algorithms.md) | Box/motion and pose-assisted matching, uncertainty and counting |
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
| [Motion runner report](reports/motion-runner.html) | Runner scaffold change and documentation verification |

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

The diagnostic slice now implements vision, contracts, motion presentation and the mirror viewer. Session and game directories remain ownership notes until their milestones begin.

## Next milestone

Continue the [M1 diagnostic mirror experiment](docs/roadmap.md#m1-diagnostic-mirror-and-hardware-experiment) before polishing a game. The single-view skeleton viewer is implemented; actual camera formats, the production video path, three-player crossings and physical latency still require evidence. Run `pnpm check` and `pnpm build` for the current software checks.

## Repository hosting

The repository is hosted at [DupeisTaken/motion-capture-games](https://github.com/DupeisTaken/motion-capture-games), configured locally as `origin`. The initial remote history and [MIT license](LICENSE) are preserved alongside the foundation.

The local milestone briefs and GitHub templates are ready to use. Hosted work is tracked through repository issues and pull requests; local roadmap IDs remain stable planning references. The foundation report records the earlier local-only setup and does not describe current hosting activity. Branch protection has not been verified.
