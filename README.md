# Motion capture games

A collection of local games played through body movement, with immediate on-screen feedback in a mirrored camera view or a rendered game world.

**Status: diagnostic viewer plus experimental Mole Motion and Dodgeball games.** A Python vision service and TypeScript viewer render body skeletons and automatically count current detections. [Mole Motion](docs/games/mole-motion.md) adds touch play and depth-ready push rehearsal; [Dodgeball](docs/games/dodgeball.md) adds full-body avoidance of telegraphed virtual balls. Both offer a combined pre-game setup menu, raw mirrored camera pictures and an optional separate game window. Production model selection, calibrated push input, physical collision tuning, multiplayer games, multi-view reconstruction and hardware certification remain open.

## Run the diagnostic viewer

Use Node 24.21.0, pnpm 11.25.0, and an existing Python 3.9+ interpreter for the local bootstrap:

```text
pnpm install --frozen-lockfile
pnpm setup
pnpm dev
```

Open **http://127.0.0.1:5173**. The compact test console keeps controls, skeletons, detections, performance stages and stream context on one page. Choose **Camera**, select a device by name under **Choose camera**, then choose **Start camera**. **Refresh** finds newly connected USB cameras. The same selector appears in both games after choosing Camera input. **Manual camera index** remains an advanced fallback; browser identification is optional. Choose **Synthetic scene** for generated bodies without camera access. Setup downloads pinned Python tools and verified model artifacts locally; preview inference works offline afterward. RTMPose is the development default; MediaPipe remains a comparison option. Display rendering, camera/source and pose rates are independent and reported separately. Camera access requires an explicit action. See [the viewer guide](docs/diagnostic-viewer.md) for controls, commands and limitations.

Console Stop releases only its acknowledged source. Failed capture release keeps **Retry camera stop** available and blocks replacement until confirmed. A cancelled pending start is cleaned up when its acknowledgment arrives. If startup ownership cannot be identified after a lost response, the console explains service restart/reload recovery. See [capture ownership](docs/diagnostic-viewer.md#capture-ownership-and-retry) and [the lifecycle report](reports/diagnostic-capture-lifecycle.html).

## Evaluate camera-free XYZ

Open **http://127.0.0.1:5173/rig.html** for the [two-camera operator workspace](docs/two-camera-workspace.md): paired synthetic views, estimated X/Y/Z, a rig-volume map and explicit rejection/evidence states. A physical planning mode assigns camera roles without starting capture. It prepares a possible maze input workflow; live two-camera XYZ and physical accuracy remain separate work.

`pnpm benchmark:xyz` compares three calibrated two-view reconstruction methods using seeded synthetic joints, including timing, calibration and identity failures. It uses the existing Python environment and opens no cameras. `pnpm verify:vision` checks the diagnostic viewer through real local HTTP/WebSocket transport and saves desktop/mobile screenshots. See [the XYZ design](docs/player-xyz-experiment.md) and [the issues #3/#4 delivery report](reports/vision-issues.html). Live multi-camera input, calibrated pushes and physical certification remain open.

## Play Mole Motion

Open **http://127.0.0.1:5173/mole.html** (also linked from the tracking console). The setup menu opens automatically: choose Timed, Challenge, Survival or Practice, set difficulty and Touch, Flick or Push, then confirm **Start round**. Video/input and display options share the menu. Every new round, including Play again, returns to setup; Pause/Resume stay in the play view. Flick whacks a nearby mole with a quick wrist flap; settle briefly between flicks. Your wrist must visibly move; finger-only flapping is not tracked. Rehearsal works without a camera or Python service: move the pointer or use arrow keys in the stage; aim, settle, then move quickly for Flick; tap or press Space for a simulated push. Select a wrist, hip (push only) or foot (touch only) to rehearse it.

For body tracking choose Camera, select a named device and **Start camera**, then **Start round**. Start waits for stable input from one confident participant; no separate Join is needed. Touch uses observed wrist/ankle proxies. Camera Push remains unavailable without calibrated depth. Missing feet/joints pause scoring and recover through a countdown. Explicit identity loss, a changed track/source/calibration or a long input gap needs **New round**, which opens setup before confirming a fresh round. End a round to change settings. See [the game design](docs/games/mole-motion.md).

**Open game window** moves the same live stage and score HUD to a separate window; controls and tracking details stay with the operator. Camera pixels have no tint or body mask. Tracking graphics are optional in the operator preview and always hidden in the game window. Closing the window returns the stage without restarting capture. Keep the operator page open. A browser may open a tab instead, especially on mobile; popup-blocked guidance keeps the inline game usable. If capture release cannot be confirmed, **Retry camera stop** stays available and replacement capture waits for acknowledgement. [The camera gameplay report](reports/raw-game-display.html) records actual checks and limitations.

## Play the experimental arcade

Both games default to **Camera** and list connected devices on load. Choose a device and press **Start camera** to begin capture. Facing the screen, moving to your left moves your mirrored image left; rehearsal pointer and arrow controls follow the same screen directions. Select **Rehearsal** for camera-free controls. [The camera-default report](reports/camera-default.html) records the verification.

Open [Mole Motion](http://127.0.0.1:5173/mole.html) or [Dodgeball](http://127.0.0.1:5173/dodgeball.html) after starting the local server. Both offer camera-free rehearsal and a combined video/game setup menu before every new round. Its Start confirmation waits for usable input. Dodgeball previews each virtual ball with a warning ring: move your body clear before impact. Missing feet, joints or uncertain tracking pause the round fairly. See [the dodgeball design](docs/games/dodgeball.md) and [delivery report](reports/dodgeball.html).

These are early experimental game slices. Physical framing/collision accuracy, participant height and movement tuning, hardware capacity and latency still require M1/M4 evidence.

## Agreed scope

- A digital mirror: live camera video with graphics and sound for camera-overlay games; a rendered world for the motion runner.
- Two USB cameras advertised as 4K at 60 fps; exact models and formats are unverified.
- Start gameplay with one player and build toward three simultaneous players.
- Add a single-player motion runner: move left, center or right to choose a lane, jump to clear low obstacles, and squat to duck overhead obstacles. Its player limit stays at one.
- Support free movement, crossing, overlap, and explicit recovery when identity is uncertain.
- Target Windows, macOS and Linux. A Windows machine with an RTX 3070 is the proposed reference rig; physical capture and integrated graphics require separate validation per platform.
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
