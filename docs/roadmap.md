# Roadmap and issue briefs

## Hosting status

The Git remote is [DupeisTaken/motion-capture-games](https://github.com/DupeisTaken/motion-capture-games). Milestone IDs remain local planning references, separate from hosted issue numbers. Reuse or create a hosted issue for each substantive work item when it begins. Use the issue and PR templates under `.github/`. The initial direct push had no PR; subsequent work follows the contribution workflow.

[Issue #1](https://github.com/DupeisTaken/motion-capture-games/issues/1) tracks the vision research and plan; it does not close the implementation work.

The milestone IDs below are stable local references. Each milestone may become several focused issues/PRs rather than one large change. This sequence has no promised dates; hardware and experiment results determine effort.

## Application navigation

[Issue #54](https://github.com/DupeisTaken/motion-capture-games/issues/54) adds the root game directory linking Slap a Mole, Dodgeball, Motion Runner and Virtual Maze, with separate tracking-console and two-camera operator links. `/diagnostics.html` replaces the root diagnostic entry; game URLs stay stable. See [entry points](../apps/mirror/README.md#entry-points) and [the delivery report](../reports/game-directory.html) for actual software/browser checks. This navigation work closes no physical milestone gate.

**Single-press continuation:** [Issue #53](https://github.com/DupeisTaken/motion-capture-games/issues/53) covers in-game Resume actions for Slap a Mole, Dodgeball, Motion Runner, Virtual Maze and rig pointer practice. Preserve readiness/identity gates and existing countdowns while removing navigation back to operator controls. [The delivery report](../reports/game-resume.html) owns actual software and responsive-browser evidence; physical gates remain unchanged.

## M0: Documentation foundation

**Scope:** Record the agreed product, ownership boundaries, repository conventions, proposal status and validation gates. Provide a self-contained report.

**Completion evidence:** Local documents and ownership notes exist; references and whitespace are checked; the report renders at desktop/mobile sizes; the foundation is committed. Runtime tests, hardware certification and hosted issues/PRs are outside M0. The report owns the actual verification results.

## M1: Diagnostic mirror and hardware experiment

**Two-camera operator workspace:** [Issue #34](https://github.com/DupeisTaken/motion-capture-games/issues/34) follows merged PR #31 with [operator UI and synthetic XYZ rehearsal](two-camera-workspace.md), preparing camera-role, geometry, timing and identity inspection for potential virtual-maze input. [The report](../reports/two-camera-workspace.html) owns actual checks and screenshots. Physical planning cannot certify calibration or synchronization; live paired acquisition, rig calibration, cross-view association and physical maze-input accuracy remain open M1 work.

[PR #37](https://github.com/DupeisTaken/motion-capture-games/pull/37) delivers the nine-case operator rehearsal and planning UI, with independent software reviews at 10/10 and explicit physical gates.

**Gameplay camera and operator views:** [Issue #38](https://github.com/DupeisTaken/motion-capture-games/issues/38) keeps both camera diagnostics on the operator page and selects one synthetic background for genuine Slap a Mole gameplay rehearsal. A stable pointer controller supplies current synthetic input; recorded bodies and XYZ do not control scoring. The same game/runtime/HUD moves into its player window. Selection cannot swap reconstruction roles or change XYZ. [The report](../reports/displayed-camera.html) owns actual software and browser evidence. Live dual acquisition and a calibrated body/rig-input adapter remain separate work.

[PR #41](https://github.com/DupeisTaken/motion-capture-games/pull/41) is corrected after investigation of the operator/gameplay distinction. Fresh scoring, transform, lifecycle, full software checks and responsive report evidence support a new independent 10/10 review for this scope. Earlier diagram-selection ratings do not establish gameplay acceptance. The latest-head software gate remains required before merge.

**Open-issue completion:** [The #3/#4 report](../reports/vision-issues.html) records a fresh viewer acceptance audit, decode-freshness correction and real synthetic-service browser verification. [The camera-free XYZ design](player-xyz-experiment.md) restores issue #4's isolated three-method comparison under current tooling, with strict metadata, per-joint refinement, coverage/unsafe-acceptance statistics and serial one-/three-player stage measurements. Earlier PR #7 was reverted by #9 with no recorded reason; this scoped implementation retains current capture/game boundaries. Software issue completion does not close physical M1 or enable depth scoring. Next issue-ready work: actual dual-camera calibration/USB modes, exposure synchronization, cross-view identity and independent static/dynamic accuracy and visible-latency validation using the owning physical protocol.

[PR #31](https://github.com/DupeisTaken/motion-capture-games/pull/31) delivers this software completion. Both independent reviews reached 10/10 for the declared camera-free scope; the report retains failed experiment targets, unsafe acceptances and the separate physical gates.

**Problem:** Camera specifications and model benchmarks do not establish usable feedback or identity tracking on our installation.

**Current slice:** [Issue #3](https://github.com/DupeisTaken/motion-capture-games/issues/3) implements a one-view skeleton/count diagnostic, two pretrained model adapters, two association modes, a canonical contract and synthetic verification. See [the viewer guide](diagnostic-viewer.md) and [delivery report](../reports/skeleton-diagnostics.html). This is partial M1 progress; no real three-player crossing, production media selection or hardware/latency certification gate is closed by software tests.

**Console iteration:** [Issue #15](https://github.com/DupeisTaken/motion-capture-games/issues/15) adds a compact single-page test console, explicit browser discovery/identification with manual native-index verification, bounded stage diagnostics, less DOM churn, high-resolution host timing and synthetic pacing fixes. [The console report](../reports/diagnostic-console.html) owns actual checks and synthetic measurements. Physical M1 gates and [independent high-rate preview #10](https://github.com/DupeisTaken/motion-capture-games/issues/10) remain open.

**Capture lifecycle:** [Issue #26](https://github.com/DupeisTaken/motion-capture-games/issues/26) scopes diagnostic cleanup to acknowledged epochs, preserves cancelled startup for late cleanup and keeps failed release retryable with replacement blocked. [The lifecycle report](../reports/diagnostic-capture-lifecycle.html) owns synthetic control/resource evidence and actual checks. Lost startup responses and page destruction still require a separate request-token/lease decision for guaranteed cleanup; physical driver release remains unverified.

**Camera selection:** [Issue #23](https://github.com/DupeisTaken/motion-capture-games/issues/23) adds named native choices and Refresh across the console and both games, with explicit disconnect/error states and a manual fallback. [The selection report](../reports/camera-selection.html) records actual checks; it does not certify multiple simultaneous cameras or capture modes.

**Identity stability follow-up:** [Issue #11](https://github.com/DupeisTaken/motion-capture-games/issues/11) and [PR #13](https://github.com/DupeisTaken/motion-capture-games/pull/13) cover elapsed-time-aware velocity updates and independent last-observed/predicted assignment comparison in [camera-local tracking](tracking-algorithms.md). Competing feasible associations suspend affected local IDs instead of letting prediction transfer them to a neighboring person; abrupt approaches/reversals may require new tentative IDs. The [tracking stability report](../reports/tracking-stability.html) owns executed verification. Real disturbance/crossing trials, provider truncation/ranking churn at capacity, indistinguishable replacements and explicit player enrollment/recovery remain M1/M2 work; this focused fix does not close those gates.

**Owns:** Vision capture/inference adapters, the first mirror slice, draft protocol schemas, diagnostic presentation, and an initial installation/performance profile. Depends on M0.

**Acceptance criteria:**

- Enumerate and record the actual modes and timestamp quality of both cameras on the first rig.
- Establish one acquisition owner per camera and bounded pipelines with observable drops/age.
- Display primary-camera video and source-aligned joint overlays; measure the proposed video path and choose an alignment policy.
- Run one-player motion and three-player crossing/overlap scenarios before selecting the model and camera placement.
- Benchmark candidate full pipelines at one and three players, including detector, pose, tracking, view count, media delivery and rendering.
- Establish explicit identity quality, slot association and recovery behavior; no guessed score ownership.
- Record external motion-to-visible latency, frame/pose timing, alignment and limitations. Declare supported capacity; do not certify an untested hardware tier.
- Decide whether secondary-view fusion is required and justified. Validate synchronization/geometry before using it for fast-motion reconstruction.
- Introduce pnpm/uv manifests, pinned toolchain, root commands and applicable checks with the runnable slice.
- Update ADR 0002/0003 with the measured selection or unresolved gate and deliver the HTML report.

**Exit:** A measured architecture decision, reproducible diagnostic setup, and an honest capacity profile. If a candidate misses the budget, revise it within this milestone before building polished games.

### Vision experiment work briefs

The [research plan](vision-research.md#10-m1-experiment-and-decision-gates) details the proposed protocols and exit evidence. These stable local briefs are issue-ready; M1-V1–V6 do not yet have individual hosted implementation issues.

- **M1-V1:** Audit camera/USB modes and timestamps; verify exact pretrained artifacts, provenance and offline loading.
- **M1-V2:** Build the one-player diagnostic mirror with canonical joints, correct transforms and source/video timing instrumentation.
- **M1-V3:** Compare RTMDet + RTMPose-s/m with MediaPipe on the same task-joint and full-pipeline measurements.
- **M1-V4:** Compare ByteTrack with pose-assisted association; verify explicit joining, three-player crossings, uncertainty and recovery.
- **M1-V5:** Measure the second camera's benefit and cost; gate reconstructed scoring on geometry and exposure alignment.
- **M1-V6:** Record the measured model/provider/view selection, supported capacity and evidence for or against custom training.

All six remain open. [ADR 0004](decisions/0004-proposed-vision-experiment.md) records the proposal without changing the accepted identity principles.

## M2: Whack-a-mole vertical slice

**Concurrent targets:** [Issue #48](https://github.com/DupeisTaken/motion-capture-games/issues/48) gives the admitted player two longer-lived moles and one bomb that deducts 50 points on contact. Each target has independent timing and replacement. [The delivery report](../reports/slap-a-mole-bombs.html) records software and browser checks. Physical playtesting and admitting multiple players remain M2 work.

**Pre-game setup:** [Issue #33](https://github.com/DupeisTaken/motion-capture-games/issues/33) combines video/input, display and game-specific options in one menu opened on load and before every new round in both games. Start confirmation requests play; closing setup preserves results, and Pause/Resume stay in the play view. [The setup report](../reports/pre-game-settings.html) records actual checks and English desktop/mobile evidence. No new distributable or physical gate is introduced.

Wrist-flap extension: [issue #29](https://github.com/DupeisTaken/motion-capture-games/issues/29) adds an optional 2D Flick interaction with nearby swept collision, source-timed thresholds, settled-hand rearming and conservative history resets. [The report](../reports/wrist-flick.html) records verification; physical sensitivity and stationary-wrist hand-orientation tracking remain open.

**Camera gameplay follow-up:** [Issue #25](https://github.com/DupeisTaken/motion-capture-games/issues/25) simplifies Slap a Mole and Dodgeball to Start that waits for unique stable input, untinted camera pictures, operator-only tracking graphics and a separate window for the existing live game stage. Same-owner joint loss recovers fairly; explicit identity loss requires a new round. [The report](../reports/raw-game-display.html) owns executed tests/browser/review evidence. Windows/macOS/Linux software compatibility is separate from physical camera and participant certification.

**Problem:** Establish a complete, understandable game interaction and reliable attribution.

**Owns:** Game-ready motion input, session lifecycle, explicit joining, practice, target interaction, score/results and replay. Depends on the relevant M1 gates.

**Experimental software progress:** [Issue #12](https://github.com/DupeisTaken/motion-capture-games/issues/12) and [PR #17](https://github.com/DupeisTaken/motion-capture-games/pull/17) start [Slap a Mole](games/mole-motion.md) early at the user's request. Its one-player runtime includes seeded target/scoring replay, camera wrist/ankle contact, synthetic depth-push rehearsal, timed/challenge/survival/practice modes, hard distance-biased placement and explicit framing/identity pause recovery. [The delivery report](../reports/mole-motion.html) owns actual software and browser evidence. This does not close M1, certify physical pushes, establish participant reach/latency, or deliver three-player scoring. Next issue-ready work: calibrated depth provider and participant reach setup; physical hit/framing trials; measured session identity/recovery before multiplayer admission. Reuse the existing [XYZ experiment issue #4](https://github.com/DupeisTaken/motion-capture-games/issues/4) when scoping calibrated depth.

**Acceptance criteria:**

- A one-player session starts, teaches reaching, scores targets and restarts without operator code changes.
- Repeat-hit, target consumption and stale/missing-input rules are documented and behavior-tested.
- Game-input replay reproduces scoring within declared version/tolerance.
- Expand to three admitted players on the certified profile; crossings never silently exchange slot scores in the scenario set.
- Verify camera loss, recovery, capacity rejection and calibration changes.
- Include real-server UI screenshots, applicable tests and the HTML report.

**Experimental multiplayer software:** [Issue #59](https://github.com/DupeisTaken/motion-capture-games/issues/59) adds explicit 1–3 anonymous slots and independent Mole/Dodgeball runtimes, targets/obstacles, scores and active clocks using one camera stream. Spectators stay unenrolled; quality failures suspend affected attribution. [The multiplayer policy](multiplayer.md) and [delivery report](../reports/playtest-multiplayer.html) distinguish software evidence from still-open three-person physical trials, hardware capacity, crossing/occlusion accuracy and latency. Runner/Maze remain single-player.

## M3: Fruit slicing

**Problem:** Recognize fast swept movement between sparse observations without phantom interactions.

**Owns:** Slicing rules, visual trails and tuning; extract common motion primitives only where justified. Depends on M2.

**Acceptance criteria:** Swept collisions, target consumption and repeat-hit rules pass replay tests; trails break across identity/epoch/time gaps; fast-motion alignment and player attribution are measured; three-player interaction is validated on the supported rig; documentation, UI evidence and report are complete.

## M4: Dodgeball

**Early software slice:** [Issue #18](https://github.com/DupeisTaken/motion-capture-games/issues/18) adds the experimental single-player [Dodgeball game](games/dodgeball.md), using canonical full-body input, telegraphed virtual obstacles, confidence-aware pause/recovery and the Slap a Mole framing warning. [The delivery report](../reports/dodgeball.html) owns actual software and UI evidence. This user-requested early slice does not close M1 or M4: real participant trials at different heights/positions, physical collision/framing accuracy and installation tuning remain open.

**Problem:** Make virtual obstacle avoidance understandable with confidence-aware body collision shapes.

**Owns:** Body-region collision rules, obstacle timing, avoidance feedback and play-space tuning. Depends on M2; reuse M3 work only where relevant.

**Acceptance criteria:** Body-shape and missing-joint policies are documented/tested; obstacle timing shares the observation/game timeline; avoidance is playtested at different heights and positions; uncertainty produces a fair pause policy; any depth requirement has separate calibration evidence; UI evidence and report are complete.

## M5: Deployment and additional hardware profiles

**Problem:** Make the validated installation reproducible and usable without developer setup.

**Owns:** Offline asset/model packaging, launch/recovery, camera permission flow, profile selection and additional Windows/macOS tiers. Depends on M1 and at least one complete game.

**Acceptance criteria:** Clean installation and offline launch work on each declared target; model provenance and pinned versions ship with the package; operator recovery and calibration verification work; each new tier has its own capacity/latency evidence; the packaging decision record and report reflect actual results.

Packaging concerns such as camera permissions may be investigated during M1; final distribution can wait until the runtime path is validated.

## M6: Single-player motion runner

**Experimental software slice:** [Issue #39](https://github.com/DupeisTaken/motion-capture-games/issues/39) / [PR #44](https://github.com/DupeisTaken/motion-capture-games/pull/44) implements Neon Rails / Gold Rush with single-player pause rules, calibrated image-space jump/duck controls, original 3D worlds/skins, camera-free rehearsal and deterministic simulation tests. [The report](../reports/motion-runner-game.html) records actual checks, reference-footage comparisons and independent review. This early implementation does not close M1 hardware or M6 physical accuracy/latency gates. Next issue-ready scope: participant trials for lane reach/hysteresis, jump/duck confusion, varied heights, spectator occlusion and external visible-latency measurement.

**Problem:** Let one participant control an on-screen runner with left/center/right movement, jumping and squatting, without confusing tracking gaps with player mistakes.

**Owns:** The [runner design](games/motion-runner.md), a future `games/motion-runner/` module, rendered-world presentation, lane/action calibration, obstacles, scoring and replay. Depends on the relevant M1 gates and M2's session/replay foundation. M3/M4 and final M5 packaging are not prerequisites; M6 preserves existing milestone IDs rather than forcing a new release order.

**Acceptance criteria:**

- Admit exactly one joined player even on a higher-capacity profile; spectators and additional join attempts cannot acquire control.
- Teach and validate left, center and right physical lane positions, jump and squat-to-duck in practice, with an explicit participant-relative mapping and safe play boundary.
- Validate lane boundary hysteresis, held positions, return to center, direct side-to-side movement and lane input during vertical actions; tune thresholds through measured trials rather than hard-coded assumptions.
- Validate one jump per takeoff/landing cycle, held squat/release, incidental head/torso motion and conflicting jump/duck evidence. Declare a minimum supported input capability set.
- Keep world progression, collisions, distance and scoring on the same paused game timeline during missing/stale/ambiguous input. Recovery resets action history and resumes through a readiness/countdown step without catch-up penalties.
- Use seeded pose/game-input replays for obstacle outcomes, action timing, delayed/out-of-order observations, epoch changes, calibration changes and spectator entry. Report the declared version/tolerance.
- Measure recognition errors and action-to-visible timing for each control on the supported installation, including different participant heights and movement ranges. Perspective graphics alone do not justify calibrated 3D input.
- Verify rendered gameplay and setup/recovery UI from a real server at the supported display aspect ratio and relevant desktop/mobile operator sizes; deliver tests, owning docs and the HTML report.

**Current status:** Experimental software controls, seeded obstacles, rendered worlds and source-timed pause/recovery are implemented. The gait/pace follow-up adds an articulated runner and an opt-in faster opening; [its report](../reports/runner-motion-pace.html) owns actual evidence. Physical recognition accuracy, camera hardware capability and end-to-end latency remain unmeasured. [Testing scenarios](testing.md#motion-runner-acceptance-scenarios) define future evidence.

**Scaffold delivery:** [Issue #5](https://github.com/DupeisTaken/motion-capture-games/issues/5) and [PR #6](https://github.com/DupeisTaken/motion-capture-games/pull/6) track this documentation update; [the runner report](../reports/motion-runner.html) records its actual checks. M6 implementation needs its own issue when work begins; completing the scaffold does not close the game milestone.

## M7: Single-player virtual maze

**Problem:** Let one participant navigate a virtual maze using directional buzzer feedback while an operator sees the maze and current position. A position estimate alone cannot determine which wall is ahead; facing requires independent Head/Torso evidence.

**Owns:** The [Virtual Maze design](games/virtual-maze.md), a source-only `games/virtual-maze/` module, explicit position/facing readiness, manual metric corner registration, seeded generation, directional wall/collision/goal rules, operator map and map-free participant intensity/audio. M7 preserves existing milestone IDs and starts a camera-free rehearsal at the user's request. Physical gameplay depends on relevant M1 geometry, timing, identity and accuracy evidence; the existing two-camera planning screen cannot enable it.

**Software slice:** [Issue #40](https://github.com/DupeisTaken/motion-capture-games/issues/40) tracks `/maze.html`, rehearsing 5..10 m width and depth independently, Easy/Medium/Hard generation, internal loops, and explicit Head/Torso selection with Torso as default. Synthetic X/Z and independent heading controls exercise the game without cameras or Python inference. Four named local photo annotations are planning only; the separate metric registration API requires already-calibrated rig-ground coordinates. Browser audio requires explicit activation and follows normalized game intensity. [The delivery report](../reports/virtual-maze.html) owns actual check/browser results and hosting links when available. Software delivery does not close physical M7 or M1.

**Software acceptance criteria:**

- Validate independent finite dimensions in 5..10 m, preserve metric aspect/scale and generate reproducible connected mazes for all three difficulties and the same seed/code revision.
- With internal loops enabled, verify BFS reachability of the selected interior goal and failure of both documented canonical hand-rule followers from the declared start/initial heading. Show that test's scope; a cycle count alone is insufficient and arbitrary human strategies are not covered.
- Compute wall-ahead clearance/intensity in metric coordinates from the explicitly selected head or torso vector. Test stationary turns, differing headings, walls behind the participant, corridor openings, contact and goal behavior.
- Validate named metric corners and reject malformed/degenerate/inconsistent input. Document the future adapter's duty to bind registration to rig calibration; the current pure registration object has no revision field. Keep photo image annotations separate from calibration and prevent local photos entering reports/fixtures.
- Reject missing/stale/uncertain selected direction and incompatible identity/time/calibration. Treat out-of-bounds position explicitly without clamping or goal reward; never substitute orientation or infer it from position/velocity. Physical-origin input remains unavailable in the rehearsal.
- Keep participant presentation free of maze/route/position data; provide an inline alternative and separate window. Require explicit sound enable, bounded gain and immediate silence on pause/lost input/unavailable presentation. Verify keyboard/touch, popup cleanup and English desktop/mobile layouts from a real server.
- Run meaningful deterministic generation, registration/input, geometry, lifecycle/audio and UI tests; run `pnpm verify:maze`, `pnpm check` and `pnpm build`. Deliver owning documentation, self-contained HTML evidence and a focused linked PR when hosting access permits it.

**Physical follow-up briefs, all open:**

- **M7-P1: Trusted maze input.** Add simultaneous acquisition behind the vision boundary, verified exposure/clock mapping, cross-view identity and calibrated rig observations; preserve bounded queues and source provenance. Reuse M1 work rather than opening cameras in a game. Define and version the live input contract.
- **M7-P2: Corners and cone evidence.** Establish actual corner labels/colors and calibrated floor-contact observations, manual fallback and held-out metric checks. Evaluate HSV segmentation/morphology/contours only against actual lighting and occlusion, documenting failure/uncertainty. Moving a cone/camera invalidates its registration evidence. Photo clicks remain planning until an independent calibration workflow is implemented and verified.
- **M7-P3: Facing capability.** Measure Head and Torso separately, including neutral/front-back calibration, stationary/head-only/torso-only turns, backward walking, pitch/roll, occlusion and differing orientations. Head is not eye gaze. Publish angular error, coverage and failure policy; no selected-source fallback.
- **M7-P4: Supervised installation trials.** Measure position and directional-clearance error, usable updates, motion-to-buzzer latency and signal perception on a declared 5..10 m installation. Check room boundaries, corridor/body clearance, operator stop and recovery. Record trial counts, rig/profile and limitations before enabling physical navigation.

**Exit:** The software slice may be reviewed and delivered on its own with honest limitations. M7 closes only when the physical follow-up evidence and supervised participant acceptance exist; synthetic tests do not certify a room.

## Smooth diagnostic preview follow-up

[Issue #10](https://github.com/DupeisTaken/motion-capture-games/issues/10) tracks RTMPose as the development default and independent smooth display rendering. [ADR 0006](decisions/0006-independent-preview.md) records source/pose timing limits; [the report](../reports/preview-performance.html) records actual software and performance evidence. This does not close M1 hardware, external-latency or multiplayer gates.
