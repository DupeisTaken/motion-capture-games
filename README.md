# Motion capture games

A collection of local games played through body movement, with immediate on-screen feedback in a mirrored camera view or a rendered game world.

**Status: diagnostic viewer plus experimental Mole Motion and Dodgeball games.** A Python vision service and TypeScript viewer render body skeletons and automatically count current detections. [Mole Motion](docs/games/mole-motion.md) adds touch play and depth-ready push rehearsal; [Dodgeball](docs/games/dodgeball.md) adds full-body avoidance of telegraphed virtual balls. Both use explicit single-player joining and fair pause/recovery. Production model selection, calibrated push input, physical collision tuning, multiplayer games, multi-view reconstruction and hardware certification remain open.

## Run the diagnostic viewer

Use Node 24.21.0, pnpm 11.25.0, and an existing Python 3.9+ interpreter for the local bootstrap:

```text
pnpm install --frozen-lockfile
pnpm setup
pnpm dev
```

Open **http://127.0.0.1:5173**. The compact test console keeps controls, skeletons, detections, performance stages and stream context on one page. Choose **Camera**, select a device by name under **Choose camera**, then choose **Start camera**. **Refresh** finds newly connected USB cameras. The same selector appears in both games after choosing Camera input. **Manual camera index** remains an advanced fallback; browser identification is optional. Choose **Synthetic scene** for generated bodies without camera access. Setup downloads pinned Python tools and verified model artifacts locally; preview inference works offline afterward. RTMPose is the development default; MediaPipe remains a comparison option. Display rendering, camera/source and pose rates are independent and reported separately. Camera access requires an explicit action. See [the viewer guide](docs/diagnostic-viewer.md) for controls, commands and limitations.

## Play Mole Motion

Open **http://127.0.0.1:5173/mole.html** (also linked from the tracking console). Choose Timed, Challenge, Survival or Practice; set difficulty and Touch or Push; then **Join player 1** and **Start round**. Rehearsal works without a camera or Python service: move the pointer or use arrow keys in the stage; tap or press Space for a simulated push. Select a wrist, hip (push only) or foot (touch only) to rehearse it.

For body tracking choose Camera, explicitly start it, choose the labeled participant track and join. Touch uses observed wrist/ankle proxies. Existing camera adapters have no calibrated depth, so camera Push is unavailable; rehearsal is not a physical push measurement. Both feet must remain visible; missing feet, stale/uncertain input or a hidden tab suspend the round with explicit countdown recovery. Camera loss requires explicit rejoin; a changed track/source/calibration requires a new round. End a round to change settings. See the [game design and tuning](docs/games/mole-motion.md) and [delivery report](reports/mole-motion.html).

Start and Resume remain disabled while required input is unavailable. The joined camera track is labeled and locked during membership. If camera release cannot be confirmed, the local preview stops and **Retry camera stop** stays available, even in rehearsal; retry before starting another camera source. This reports driver/network failures without claiming capture has been released.

## Play the experimental arcade

Open [Mole Motion](http://127.0.0.1:5173/mole.html) or [Dodgeball](http://127.0.0.1:5173/dodgeball.html) after starting the local server. Both offer a camera-free synthetic rehearsal and explicit single-player joining. Dodgeball previews each virtual ball with a warning ring: move your visible body clear before impact. Missing feet, body joints or uncertain tracking pause the round with explicit recovery. See [the dodgeball design](docs/games/dodgeball.md) and [delivery report](reports/dodgeball.html).

These are early experimental game slices. Physical framing/collision accuracy, participant height and movement tuning, hardware capacity and latency still require M1/M4 evidence.

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
| [Mole Motion](docs/games/mole-motion.md) | Play modes, touch/push rules, session safety, tuning and remaining gates |
| [Dodgeball](docs/games/dodgeball.md) | Full-body avoidance, warning rings, collision shapes and recovery |
| [Architecture](docs/architecture.md) | Runtime boundaries, ownership, and provisional stack |
| [Diagnostic viewer](docs/diagnostic-viewer.md) | Setup, skeleton rendering, automatic counts, algorithms and recovery |
| [Tracking algorithms](docs/tracking-algorithms.md) | Box/motion and pose-assisted matching, uncertainty and counting |
| [Tracking stability report](reports/tracking-stability.html) | Identity-switch correction, synthetic before/after evidence and verification |
| [Coordinates and timing](docs/coordinates-and-timing.md) | Observation semantics, transforms, clocks, and replay |
| [Multiplayer](docs/multiplayer.md) | Joining, identity, uncertainty, and crossing scenarios |
| [Installation](docs/installation.md) | Camera placement, calibration, USB constraints, and hardware profiles |
| [Testing](docs/testing.md) | Acceptance gates, measurements, and verification expectations |
| [Roadmap](docs/roadmap.md) | Issue-ready milestones and completion criteria |
| [Decision index](docs/decisions/README.md) | Accepted decisions and proposals awaiting evidence |
| [Vision research and plan](docs/vision-research.md) | Location, motion, pose algorithms, training decisions and M1 experiment plan |
| [Vision research report](reports/vision-research.html) | Standalone, source-linked research and delivery verification |
| [Contributing](CONTRIBUTING.md) | Tooling direction and review workflow |
| [Continuous integration](docs/continuous-integration.md) | Required checks, OS coverage, package/build rules and artifacts |
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

The diagnostic slice implements vision, contracts, motion presentation and the mirror viewer. Experimental Mole Motion and Dodgeball implement game-ready input, one explicitly joined session slot and deterministic game runtimes. Other game directories remain ownership notes until their milestones begin.

## Next milestone

Continue the [M1 diagnostic mirror experiment](docs/roadmap.md#m1-diagnostic-mirror-and-hardware-experiment) alongside experimental M2/M4 software development. Mole Motion and Dodgeball start early at the user's request; they do not close M1. Actual camera formats, the production video path, three-player crossings, calibrated pushes, participant avoidance trials and physical latency still require evidence. Run `pnpm check` and `pnpm build` for the software checks.

## Repository hosting

The repository is hosted at [DupeisTaken/motion-capture-games](https://github.com/DupeisTaken/motion-capture-games), configured locally as `origin`. The initial remote history and [MIT license](LICENSE) are preserved alongside the foundation.

The local milestone briefs and GitHub templates are ready to use. Hosted work is tracked through repository issues and pull requests; local roadmap IDs remain stable planning references. The foundation report records the earlier local-only setup and does not describe current hosting activity. Branch protection has not been verified.
