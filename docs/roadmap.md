# Roadmap and issue briefs

## Hosting status

The Git remote is [DupeisTaken/motion-capture-games](https://github.com/DupeisTaken/motion-capture-games). Milestones remain local planning briefs; link hosted issues when each work item begins. Use the issue and PR templates under `.github/`. No PR was opened for the initial direct push, as requested.

The milestone IDs below are stable local references. Each milestone may become several focused issues/PRs rather than one large change. This sequence has no promised dates; hardware and experiment results determine effort.

## M0: Documentation foundation

**Scope:** Record the agreed product, ownership boundaries, repository conventions, proposal status and validation gates. Provide a self-contained report.

**Completion evidence:** Local documents and ownership notes exist; references and whitespace are checked; the report renders at desktop/mobile sizes; the foundation is committed. Runtime tests, hardware certification and hosted issues/PRs are outside M0. The report owns the actual verification results.

## M1: Diagnostic mirror and hardware experiment

**Problem:** Camera specifications and model benchmarks do not establish usable feedback or identity tracking on our installation.

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

### M1-XYZ: Two-camera player coordinates

**Work:** [Issue #4](https://github.com/DupeisTaken/motion-capture-games/issues/4); [owning experiment](player-xyz-experiment.md); [report](../reports/xyz-experiment.html). Isolated from the diagnostic viewer work in [#3](https://github.com/DupeisTaken/motion-capture-games/issues/3).

**Software evidence:** Compare DLT, closest-ray midpoint and reprojection refinement on identical seeded observations; test calibration, timing, identity, missingness and weak geometry; report spatial error, rejection coverage, one-/three-person stage timings and known unsafe acceptance. Provisional gates agreed with the user: torso p95 ≤10 cm, wrists p95 ≤15 cm, reconstruction p95 <5 ms, nominal root/wrist coverage ≥95%.

**Open physical gate:** Cameras are not connected or calibrated. User-reported 4K cameras on 1.4 m stands are insufficient to certify XYZ. Identify modes/spacing, calibrate exact lens geometry and metric scale, measure exposure offset/drift/uncertainty, validate held-out static and independently referenced dynamic motion, exercise three-player identity/recovery, and measure whole-pipeline/visible feedback (<100 ms p95 proposed). Follow the experiment's explicit sample/repetition protocol. No actual rig/performance profile or authoritative 3D gameplay is enabled until this evidence passes; M1 remains open.

## M2: Whack-a-mole vertical slice

**Problem:** Establish a complete, understandable game interaction and reliable attribution.

**Owns:** Game-ready motion input, session lifecycle, explicit joining, practice, target interaction, score/results and replay. Depends on the relevant M1 gates.

**Acceptance criteria:**

- A one-player session starts, teaches reaching, scores targets and restarts without operator code changes.
- Repeat-hit, target consumption and stale/missing-input rules are documented and behavior-tested.
- Game-input replay reproduces scoring within declared version/tolerance.
- Expand to three admitted players on the certified profile; crossings never silently exchange slot scores in the scenario set.
- Verify camera loss, recovery, capacity rejection and calibration changes.
- Include real-server UI screenshots, applicable tests and the HTML report.

## M3: Fruit slicing

**Problem:** Recognize fast swept movement between sparse observations without phantom interactions.

**Owns:** Slicing rules, visual trails and tuning; extract common motion primitives only where justified. Depends on M2.

**Acceptance criteria:** Swept collisions, target consumption and repeat-hit rules pass replay tests; trails break across identity/epoch/time gaps; fast-motion alignment and player attribution are measured; three-player interaction is validated on the supported rig; documentation, UI evidence and report are complete.

## M4: Dodgeball

**Problem:** Make virtual obstacle avoidance understandable with confidence-aware body collision shapes.

**Owns:** Body-region collision rules, obstacle timing, avoidance feedback and play-space tuning. Depends on M2; reuse M3 work only where relevant.

**Acceptance criteria:** Body-shape and missing-joint policies are documented/tested; obstacle timing shares the observation/game timeline; avoidance is playtested at different heights and positions; uncertainty produces a fair pause policy; any depth requirement has separate calibration evidence; UI evidence and report are complete.

## M5: Deployment and additional hardware profiles

**Problem:** Make the validated installation reproducible and usable without developer setup.

**Owns:** Offline asset/model packaging, launch/recovery, camera permission flow, profile selection and additional Windows/macOS tiers. Depends on M1 and at least one complete game.

**Acceptance criteria:** Clean installation and offline launch work on each declared target; model provenance and pinned versions ship with the package; operator recovery and calibration verification work; each new tier has its own capacity/latency evidence; the packaging decision record and report reflect actual results.

Packaging concerns such as camera permissions may be investigated during M1; final distribution can wait until the runtime path is validated.
