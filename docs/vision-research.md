# How the games will locate players and capture motion

Research and implementation proposal · 9 November 2026 · English

**Recommendation:** Start with pretrained person detection and pose estimation, then build confidence-aware tracking and game rules around those observations. Benchmark **RTMDet-nano + RTMPose-s**, with RTMPose-m as an accuracy variant, against **MediaPipe Pose Landmarker**. Use a **ByteTrack baseline with explicit ambiguity handling**, and evaluate pose-assisted association separately. Use a **One Euro filter** for joint motion and **geometric collisions/state machines** for the initial games. Do not train a new pose model or posture classifier before testing these baselines.

This is a proposed M1 experiment, not a final model selection. The repository is still a documentation foundation: no inference, game, model conversion, camera test, or performance benchmark ran for this research. The companion [standalone HTML report](../reports/vision-research.html) contains this analysis and a delivery verification record.

## 1. What the repository actually needs

The [product scope](product-scope.md) specifies a mirrored camera display, local/offline gameplay, two USB cameras advertised as 4K/60 fps, one initial player, and growth to three players who can cross and overlap. The proposed reference rig has an RTX 3070; other Windows/macOS machines require separate profiles. The camera models, room, synchronization and exact host are unverified.

The initial games require **2D positions in the main camera image**:

| Game | What we must observe | What the game decides | Custom training initially? |
| --- | --- | --- | --- |
| Whack-a-mole | A fresh wrist/hand proxy and its player association | Whether the proxy enters a target; repeat-hit and cooldown rules | No |
| Fruit slicing | A valid wrist trajectory over time | Whether the swept segment intersects a target, once | No |
| Dodgeball | Visible torso/limb regions and their quality | Whether a virtual obstacle overlaps an eligible body region | No |

These requirements do not ask for finger articulation, a physically verified punch, force measurement, full animation motion capture, or absolute room coordinates. A wrist proxy is enough for the first interaction, but the UI should show it clearly so players understand what counts. Precise palm or finger actions would be a separate capability.

The repo already has the right architectural split: [vision](../services/vision/README.md) owns capture/inference/tracks; [motion](../packages/motion/README.md) owns canonical joints, transforms and motion; session owns player slots; games own hits and scoring. This proposal preserves that split.

## 2. Four problems that need different solutions

1. **Detection:** Which image regions contain people? Output person boxes.
2. **Pose estimation:** Where are each person's shoulders, elbows, wrists, hips, knees and ankles? Output joint coordinates and model scores.
3. **Tracking and identity:** Which observations belong to the same person over time and across cameras? Which anonymous session slot owns that person?
4. **Action interpretation:** Does a trajectory or posture satisfy this game's rule?

A pretrained pose model addresses the second problem, usually together with a detector. It does not inherently know our targets or game rules. A detector's third result is not necessarily Player 3. A model's confident wrist estimate can still belong to the wrong person. Joint quality, identity quality and observation freshness must therefore be separate gates.

**Body position and posture correctness are different labels.** Pose models estimate geometry. We define what a game accepts, and can do so without teaching a neural network the name of every action. If a later product asks for a specific dance sequence or detailed technique, that creates an additional recognition task with its own evidence requirements.

## 3. How location becomes a point on the mirror

### Primary-view 2D location

Proposed processing sequence:

1. Acquire an upright, unmirrored primary-camera frame once, preserving frame ID, source timestamp/clock quality and image geometry.
2. Resize/letterbox for person detection; retain the inverse transform.
3. Expand each accepted person box enough to include extended arms, crop for pose inference, and map the model's joint coordinates back through the crop and resize transforms.
4. Export named joints in the full canonical camera image. Preserve out-of-frame status; never turn a hidden or off-image hand into a valid point on the border.
5. Apply the same viewport fit/crop and presentation mirror to the video and overlay. Keep anatomical names unchanged: `left_wrist` remains the participant's left wrist.

For a simplified **uncropped** view, a normalized camera coordinate `(u, v)` maps to mirrored normalized display coordinate `(1-u, v)`. Thus `(0.25, 0.40)` appears at `(0.75, 0.40)`. In practice viewport scale and offsets also apply. Use an explicit transform, not scattered `1-x` corrections. Pixel-index implementations must handle edge conventions consistently.

For example, the pose model might place an anatomical right wrist at `(1200, 400)` in a 1920×1080 canonical image. The adapter restores that full-image location from the crop; the motion layer maps it into the actual mirror viewport; the game tests its collision proxy there. Neither the model nor the camera needs a label saying “hit mole.” See [coordinate semantics](coordinates-and-timing.md).

### Person-relative location

For posture features, use body-relative geometry when suitable: subtract the hip midpoint and scale by a valid torso length. This makes a raised-hand or bent-elbow feature less dependent on the person's image size. Keep uncertainty and minimum-length guards. Do not use this normalized skeleton for screen collision coordinates, and do not normalize away orientation or height change when the action depends on those signals.

### Room location and depth

There are three different levels of “location”:

| Required answer | Method | Limitation |
| --- | --- | --- |
| Where is the wrist on the image? | 2D pose plus inverse preprocessing and display transform | Enough for the initial mirror games; no metric depth |
| Approximately where is a person standing on the floor? | Calibrated floor mapping of a defensible floor-contact point | Ankles are above the floor, feet may be hidden or airborne; refuse unsupported estimates |
| Where is a joint in room meters? | Calibrated multi-view triangulation or a separately validated depth system | Requires geometry, corresponding joints, timing and uncertainty validation |

A floor homography is valid on its plane. It must not map an elevated hand as if that hand lay on the floor. Camera calibration and projection use intrinsics, distortion and extrinsics; OpenCV supplies calibration, stereo and triangulation operations. The proposal is to use those tools only when the required geometry exists. [OpenCV calibration documentation](https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html)

MediaPipe offers 33 landmarks, normalized image coordinates, and hip-centered estimated world landmarks in meters. Its configurable pose count is a maximum, not session identity. **Hip-centered world landmarks do not establish the person's translation in our room.** Validate any use of their depth independently. [MediaPipe output and configuration definitions](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker?tab=Python)

**Recommendation:** Make 2D mirror alignment reliable first. Do not make room reconstruction a prerequisite for games whose rules do not need it.

## 4. Which pose algorithm to try

| Candidate | What it provides | Why evaluate it | Main cost or uncertainty | Proposed role |
| --- | --- | --- | --- | --- |
| RTMDet-nano + RTMPose-s/m | Detector followed by per-person pose estimation | Separately tune person detection and wrist quality; matches the repo's existing candidate | Per-person crop/inference cost grows with visible people; runtime/export integration | First multi-person experiment |
| MediaPipe Pose Landmarker | Packaged body detection/landmark pipeline | Compact baseline and quick comparison; extra body landmarks | Validate crowd/occlusion behavior and platform-specific runtime support; add our identity layer | Mandatory baseline, possible winner if measured best |
| RTMO | One-stage multi-person pose without a separate detector | Alternative if detector/crop overhead dominates | Different export/quality tradeoff; crowd advantages may not apply at three players | Conditional experiment |
| Ultralytics YOLO pose | Packaged pretrained pose, default COCO joint set, export options | Practical integration alternative | Artifact/platform validation and licensing choice | Conditional alternative if setup or results justify it |

RTMPose is a real-time multi-person framework; its project documents RTMDet pairings, several model sizes and body schemas. Start with the 17-body-joint variant: the initial games need wrists and major body joints, not every finger. Treat s versus m as an experiment. Map outputs to canonical names and capability flags, never model indices in games. [RTMPose project](https://raw.githubusercontent.com/open-mmlab/mmpose/main/projects/rtmpose/README.md), [RTMPose paper](https://arxiv.org/abs/2303.07399)

RTMPose uses a SimCC-style coordinate classification approach: the model predicts joint locations through separate horizontal and vertical coordinate representations. This is still learned joint localization, not a classifier for our game actions. MMPose documents deployment options including ONNX Runtime and TensorRT, and supplies a direct ONNX inference example. Use an exported inference path where practical instead of carrying a training toolchain into the game installation. Verify preprocessing, decoding and output parity with the selected checkpoint. [Deployment guide](https://github.com/open-mmlab/mmpose/blob/main/docs/en/user_guides/how_to_deploy.md), [ONNX example](https://raw.githubusercontent.com/open-mmlab/mmpose/main/projects/rtmpose/examples/onnxruntime/main.py)

The RTMO project describes a one-stage alternative and reports advantages for larger crowds; this does not prove it will beat a top-down pipeline with our three players. [RTMO project](https://raw.githubusercontent.com/open-mmlab/mmpose/main/projects/rtmo/README.md)

Ultralytics currently documents pretrained pose models with a default 17-keypoint COCO layout and export support. Compare a pinned artifact rather than picking a moving “latest” label. [Ultralytics pose documentation](https://docs.ultralytics.com/tasks/pose/)

**Why this shortlist:** It covers the repo's two existing candidates and two useful alternatives without building four complete runtimes at once. Start with RTMPose and MediaPipe sequentially on the same rig/scenarios. Add another candidate only if a concrete failure needs an alternative. Published AP/FPS figures justify investigation; they are not measurements of our camera-to-screen pipeline, wrist quality or identity retention.

### Runtime and hardware choice

Propose ONNX Runtime CPU as a correctness baseline, CUDA for the RTX rig, and a separate CoreML-provider experiment where supported on macOS. TensorRT optimization comes after correctness and profiling. Provider availability is not proof that a selected graph runs entirely on the GPU or is faster. Record partitioning/fallback and numerical differences. [ONNX Runtime providers](https://onnxruntime.ai/docs/execution-providers/), [CUDA requirements](https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html), [CoreML requirements](https://onnxruntime.ai/docs/execution-providers/CoreML-ExecutionProvider.html)

Do not process 4K tensors merely because the camera offers 4K video. Enumerate actual camera modes, compare a delivered 720p/1080p starting profile where available, and choose detector/crop input sizes by reach quality and measured latency. Preserve a higher-resolution mirror path only if the USB, decoding and display budget allows it. Lower resolution can lose small wrists; compression and long exposure can blur fast hands. These are experimental tradeoffs, not settled settings.

### Provenance and availability

MMPose's main code license is Apache-2.0, with a separate exceptions list. That does not by itself clear every weight or training dataset for redistribution. Record code and checkpoint sources/terms separately. Ultralytics offers AGPL-3.0 and Enterprise routes; resolve the intended distribution against the chosen terms before adopting it. [MMPose license](https://github.com/open-mmlab/mmpose/blob/main/LICENSE), [exceptions](https://raw.githubusercontent.com/open-mmlab/mmpose/main/LICENSES.md), [Ultralytics licensing](https://www.ultralytics.com/license)

An upstream RTMPose issue reported download failures in June 2026; later comments reported recovery. This is historical availability evidence, not proof of a current outage. M1 must verify access to the exact artifacts, record hashes and package them locally before offline play. No weights were downloaded for this report. [Upstream issue and chronology](https://github.com/open-mmlab/mmpose/issues/3265)

## 5. How we keep the right player attached to motion

### Baseline and proposed extension

ByteTrack is a useful **box-tracking baseline**. It associates high-score detections first and uses lower-score detections to help recover unmatched tracks. Its reference association uses motion prediction and assignment. A low detector score is not permission to score an uncertain wrist. [ByteTrack paper](https://arxiv.org/abs/2110.06864), [matching details](https://www.ecva.net/papers/eccv_2022/papers_ECCV/papers/136820001.pdf)

Proposed extension for this repo: combine predicted box overlap, elapsed-time-aware motion, reliable pose geometry and visibility gates when comparing track/detection pairs. Use one-to-one assignment with **unmatched options**; reject infeasible pairs before solving. A Hungarian solver returns an optimum for its inputs, not proof that the match is true. Do not force every player to match.

An illustrative association cost is:

```text
cost = a × box_distance
     + b × normalized_visible_joint_distance
     + c × motion_inconsistency
```

This is our proposed design, not stock ByteTrack. Define distances, units, visibility masks and missing-feature handling. Tune thresholds/weights on a development subset; keep participant/session-separated final diagnostic sequences untouched until evaluation. Compare the baseline with this extension and measure wrong associations, ambiguity time and useful input availability. No numerical weights or confidence cutoff are accepted by this report.

Use the predicted torso/box for association only. Do not let a Kalman prediction of a hidden wrist silently become a collision. Rapid limb motion is not well described by a constant-velocity body-box model. Appearance cues may be considered later as short-lived supporting evidence, but similar clothes, lighting and views can defeat them. Face recognition and persistent personal identity are unnecessary.

### Identity lifecycle

Maintain the three identities already required by [multiplayer design](multiplayer.md):

```text
camera-local track → confidently associated rig track → explicit player slot
```

A slot owns score. It survives a lost track. A camera-local ID is scoped to its stream epoch and is not automatically stable across restarts. An internal rig track can exist with only one view; the name does not imply validated 3D.

Proposed state transitions are `unassigned → confident → ambiguous/lost → confirmed recovery`. During overlap, preserve competing hypotheses or explicitly mark uncertainty. If matching becomes ambiguous, suppress the affected slots' input. On separation, resume only after sufficient evidence; otherwise request explicit reacquisition. Clear filter/trajectory history before resuming.

Detection capacity and player capacity are different: a three-player game may see three participants plus spectators. Bound workload, but do not pick the first three detections or silently remove a joined player when a spectator appears. Prefer an operator-assisted join for the first diagnostic slice; evaluate a held raised-hand join later. A bystander is never admitted just because the model detected a body.

**Hard limit:** When two indistinguishable people fully disappear and reappear without discriminating evidence, RGB tracking cannot guarantee who is who. More training cannot recover information the cameras did not observe. The correct product behavior is a visible pause/rejoin, not a guessed score transfer.

## 6. What the second camera contributes

Use camera 1 as the mirror and authoritative 2D game view initially. Evaluate camera 2 early as an alternate observation during crossings. Separate two possible roles:

| Role | Requirements | What it permits |
| --- | --- | --- |
| Presence/identity support | Measured timing uncertainty, plausible temporal correspondence and validated association cues; geometry when used for matching | Additional evidence that a person remains present; ambiguity may still remain |
| Joint reconstruction | Intrinsics/distortion, extrinsics, same-joint/person correspondence, adequate baseline and sufficiently aligned exposures | Triangulate supported joints and project them into camera 1, with quality gates |

For reconstruction, propose: undistort observations; gate person/joint matches by time and epipolar geometry; triangulate reliable correspondences; reject poor baseline/depth, negative-depth and high-reprojection-error solutions; then project into the main image. Reprojection error alone does not prove correct identity or accurate 3D. These are engineering gates to validate, not an implemented fusion algorithm. [OpenCV geometry reference](https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html)

Software timestamps at read completion are not exposure timestamps. Two nominal 60 fps cameras can expose at different times and drift. As a synthetic illustration, `3 m/s × 0.0167 s ≈ 0.050 m`: one-frame timing mismatch can create about 5 cm of motion discrepancy at that speed. The speed and tolerance are not measurements. Derive acceptable timing uncertainty from the actual game motion/error budget.

If a hand is visible only in camera 2, one 2D observation does not generally determine its 3D point or its position in camera 1. Do not paste camera 2 coordinates onto camera 1, or apply the floor homography to a hand. Monocular inferred depth would be another separately validated assumption.

**Escalation path:** If one-view tracking fails the three-player gate, first test placement/lighting and the measured benefit of a second view. If the required identity or physical depth still cannot be observed, explain the tradeoff before proposing synchronized/depth hardware or a change in interaction rules. This report does not recommend buying unverified replacement cameras.

## 7. How motion and posture become gameplay

### Motion processing

Keep a short, bounded history per joint and identity. Compute velocity from source-time differences, not frame count. Reject non-positive intervals, stale/out-of-order observations and incompatible clock epochs. Do not bridge an occlusion, calibration change or identity ambiguity with a long synthetic motion segment.

Benchmark a One Euro filter against unfiltered input. It adapts low-pass smoothing to speed to trade stationary jitter against fast-motion lag. Tune in a declared coordinate space with actual sample intervals; reset on reacquisition. It is signal processing, not model training. [Author's algorithm and tuning guidance](https://gery.casiez.net/1euro/)

The filtering policy used for scoring must be explicit and replayable. Additional display interpolation/prediction may make the mirror look smooth, but cannot silently generate authoritative collisions. A useful observation is a fresh, valid, correctly associated sample; emitting 30 stale or guessed samples per second does not meet the pose-update goal.

### Game-specific decisions

| Interaction | Proposed algorithm | Required safeguards |
| --- | --- | --- |
| Reach into a mole target | Wrist point/disk overlap with a target; entry/arming state machine | Valid identity/joint/time; consume or cooldown once; practice calibration |
| Slice a fruit | Segment/capsule swept collision between consecutive valid wrist samples | Same identity/epoch/transform, bounded gap, target motion on the same timeline; one consumption |
| Avoid a virtual obstacle | Torso polygon plus limb capsules, restricted to supported visible regions | Missing/uncertain region policy; no unfair hit or miss penalty from absent evidence |
| Raise hand to join | Wrist-above-shoulder feature with hold and release hysteresis | Confident track, valid relevant joints, explicit confirmation; operator join remains an option |
| Later crouch/squat interaction | Relative hip/torso height and projected knee features over time | Viewpoint/body-size calibration, degenerate-joint guards and a neutral/unknown state |

Games own these decisions. Vision exports geometry and quality, and the motion layer exports reusable primitives. A shared “punch” classifier should not become the place that decides a whack score.

An elbow angle can be estimated from vectors shoulder–elbow and wrist–elbow, but a 2D projected angle changes with viewpoint and foreshortening. Use it only for a defined game action within validated views. Geometry and threshold crossing are established ways to interpret landmarks; Google's example also demonstrates a small k-NN posture classifier. [Pose classification options](https://developers.google.com/ml-kit/vision/pose-detection/classifying-poses)

For any posture rule, define enter/exit thresholds, minimum duration, required joints, a reset path and negative examples. A single noisy frame should not produce repeated actions. These rules express game intent; they do not establish medically or biomechanically correct technique.

If a future action requires precise palms/fingers, evaluate a hand model or whole-body model, with explicit hand-to-person association and added compute measurements. MediaPipe Hand Landmarker provides hand landmarks and handedness; this does not remove the need to assign an overlapping hand to the correct player. [Hand Landmarker documentation](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker)

## 8. Do we need to train our own model?

**For the initial three games: no custom training is justified yet.** We still need installation calibration, reach/difficulty tuning and a representative evaluation set. Those are not the same as retraining the body-location network.

| Approach | Data/work required | When it makes sense here |
| --- | --- | --- |
| Pretrained pose + geometric rules | Evaluation labels, calibration and threshold validation | Start here for reach, slicing, body regions and simple join gestures |
| Frozen pose + small posture classifier | Labeled skeleton examples and explicit unknown/negative classes | When useful static poses cannot be separated reliably by understandable rules |
| Frozen pose + temporal classifier | Labeled motion windows with start/end boundaries, timing and negatives | When future combinations or sequences require temporal context |
| Fine-tune detector/pose | Image-level boxes or joint annotations with visibility and representative failures | Only after systematic detector/joint errors survive camera and model improvements |
| Train body pose from scratch | Broad licensed annotated data, substantial compute and model engineering | No present requirement supports this cost |

For static poses, first compare rule features with k-NN or a small linear/tree classifier. For sequences, compare a bounded template method with a small causal temporal network before considering larger models. ST-GCN is a researched skeleton-action approach that learns spatial and temporal patterns; it is an escalation example, not a required dependency or evidence that its published classes match our games. [ST-GCN paper](https://arxiv.org/abs/1801.07455)

### Evidence required before training

1. Classify the failure: person not detected, joint misplaced, identity swapped, time/transform wrong, or correct skeleton interpreted incorrectly.
2. Fix acquisition, coverage, preprocessing and timing errors before changing weights. A classifier cannot repair a wrong person's skeleton.
3. Define the intended action and acceptable false positives/negatives. Include neutral motion, partial/incorrect actions, transitions and spectators.
4. Collect consented representative examples locally. Keep raw participant footage and private labels out of commits; committed tests use synthetic observations.
5. Split by participant, session and installation before making windows. Keep near-duplicate frames and overlapping windows in the same split. An unseen participant/session must remain held out.
6. Run the simplest baseline and plot a learning curve. Increase data based on error diversity and held-out improvement; no universal “100 examples is enough” claim applies.
7. Compare the trained candidate with the baseline at matched latency and rejection policies. Promote only if it improves the relevant failures without unacceptable false triggers or subgroup regressions.

Measure event-level precision/recall, false activations per minute, missed events, onset delay, unknown/rejection rate and results across representative body sizes, clothing, mobility and lighting. Report whole events and time under valid input, not only frame accuracy. A causal classifier can use only the past/current window; future-frame context adds reaction delay and must not be hidden.

Fine-tuning pose and training a posture classifier are different investments. The former improves where joints are; the latter learns what a sequence means. Both require new artifact/version/provenance records. Neither removes the need for identity, freshness or calibration checks.

## 9. Timing and compute plan

Preserve a frame ID and timing lineage from capture through inference and presentation. Match observations to the primary video frame actually presented, not the latest packet. Retain device timestamps if meaningful and label host-only timing honestly. Bound matching waits so alignment buffering cannot quietly consume the responsiveness budget. The repository's WebRTC path remains a candidate, not a proven transport choice.

Use a latest-pending-frame policy with bounded workers as the first experiment, count dropped work, and reject obsolete results. Detection, per-person pose, second-view processing, video and rendering share the same rig resources. Account for spectators as well as joined players. Do not turn down active players or change collision behavior silently to hide overload.

| Existing proposed target | What to measure | Status |
| --- | --- | --- |
| Stable 60 Hz rendering | Frame-time distribution and missed frames with video/overlays | Unmeasured |
| At least 30 useful pose updates/s per active player | Valid same-identity sample intervals, gaps and coverage | Unmeasured |
| p95 motion-to-visible below 100 ms | External high-frame-rate physical measurement, correlated traces | Unmeasured |
| Video/pose skew and freshness | Presentation skew, joint displacement, queue age and clock uncertainty | Thresholds to be chosen in M1 |
| Three players | Crossings/overlap, ambiguity, recovery, wrong-slot events | Uncertified |

These are inherited [testing targets](testing.md), not newly promised performance. Report p50/p95/p99 where useful, sample counts, warm-up, duration, exact hardware, model hashes, provider, camera modes and active view/person count. Do not sum stage p95 values to claim total p95. A second camera can improve coverage while worsening latency; accept it only on measured benefit.

## 10. M1 experiment and decision gates

The following are proposed issue-sized work packages within [M1](roadmap.md#m1-diagnostic-mirror-and-hardware-experiment). They are sequential acceptance gates, not a calendar estimate. [Research issue #1](https://github.com/DupeisTaken/motion-capture-games/issues/1) tracks this analysis; M1-V1–V6 remain local implementation briefs rather than individual hosted issues.

| Work package | Deliverable | Exit evidence |
| --- | --- | --- |
| M1-V1: Acquisition and artifact feasibility | Camera/USB inventory, timestamp audit, exact model provenance and local inference smoke test | Real modes/clock quality recorded; selected artifacts can be acquired, hashed and loaded offline |
| M1-V2: One-player diagnostic mirror | Main-camera video, named joints, quality and timing instrumentation | Correct crop/mirror/alignment; bounded pipeline; measured one-player reach/fast-motion behavior |
| M1-V3: Controlled model comparison | RTMPose-s/m versus MediaPipe on the same scenario set | Full-pipeline timing and task-joint error/coverage; deployability documented; conditional alternative only if needed |
| M1-V4: Three-player identity | ByteTrack baseline, pose-assisted association experiment, explicit join/uncertainty/recovery | Crossings, spectators and restart scenarios; no observed wrong-slot scoring in the agreed set; useful availability reported |
| M1-V5: Second-view ablation | Primary-only versus secondary-assisted trials | Measured association/coverage benefit and compute cost; geometry/timing gate before any reconstructed scoring |
| M1-V6: Selection and scope | Evidence-based ADR update, capability/profile and next implementation issues | Choose model/provider/view policy or leave failed gates open; record training decision from failure evidence |

### Proposed diagnostic protocol

First audit exposure, blur, lighting, complete reach coverage and preprocessing with one participant. Then run the repo's required [crossing and recovery scenarios](multiplayer.md#required-diagnostic-scenarios). Suggested starting design: ten scripted repetitions per crossing/occlusion scenario for each finalist configuration, followed by a ten-minute mixed-motion session on the candidate configuration. Fix repetitions and conditions before comparisons; adjust scope explicitly if feasibility demands it. These counts are planning suggestions, not completed trials or proof of statistical sufficiency.

Include similar clothes, different heights, arms near image edges, overlapping hands, full primary-view occlusion, exit/re-entry with a spectator, each camera unplugged, tracker restart/reused IDs, stale packets and calibration changes. Evaluate slow holds and fast reaches in the same coordinate space. Serialize model/camera benchmarks and keep thread/worker counts bounded so the machine remains responsive.

For joint accuracy, create a small stratified, consented, locally retained annotated evaluation subset, including visible and occluded labels and uncertainty. Report wrist/torso error in primary-image pixels and relative to target/body size; report coverage and false-valid observations separately. Set acceptable error against actual target sizes before choosing a winner. Public COCO AP alone does not answer whether a wrist can hit our smallest target fairly.

For identity, record switches, confident wrong associations, ambiguity duration, recovery time, per-player valid-input fraction, wrong-slot events and observation gaps. Count uncertainty honestly: a tracker that always abstains cannot win on zero errors alone. A scoring harness or minimal diagnostic targets must exercise slot attribution before M2 is certified. Separate that evidence from tracker-only identity metrics.

For motion/game behavior, add deterministic synthetic tests for inverse crop/mirror mapping, anatomical sides, variable timestamps, missing joints, identity/epoch changes, reacquisition resets, swept collisions, moving targets and repeat consumption. A no-gap slice should hit once; a reacquired wrist across a gap should never sweep across the screen. These tests belong to implementation; none exist or ran in this research change.

### Selection rule

Reject candidates that cannot support required joint semantics, offline packaging, correctness or identity suspension. Among the survivors, compare task accuracy, valid-input availability, p95/p99 feedback and resource use on the actual target rig. Prefer the simplest candidate meeting the agreed gates. If no candidate passes, document the failed gate and investigate its root cause rather than moving directly into polished games or assuming custom training will fix it.

## 11. Implementation boundaries and first backlog

| Owner | Planned addition |
| --- | --- |
| `services/vision` | Single camera owners, frame/timing envelopes, replaceable model adapters, inverse preprocessing, tracker, association and calibration diagnostics |
| `contracts` | Versioned canonical joints/quality, camera and rig track IDs, coordinate/model provenance, source clocks and epochs; schema checks |
| `packages/motion` | Confidence/freshness gating, display transform, One Euro experiment, source-time velocity and discontinuity-safe segments |
| `packages/session` | Explicit slot join, admission capacity, ambiguity/loss/recovery and score retention |
| `games` | Reach, swept-slice and body-region collision rules with replayable tuning |
| `packages/diagnostics` / `apps/mirror` | Named player overlays, observed/estimated/predicted distinctions, timing/drops and actionable recovery |
| `models/manifests` / profiles | Artifact hashes, code/weight provenance, input/output semantics, provider compatibility and measured supported capacity |

The first runnable slice should introduce the repo-local Python/TypeScript environments and root checks already described in CONTRIBUTING. This research does not install an inference stack, create runtime packages, select camera purchases or change accepted product scope.

## 12. What would change the recommendation

| Evidence | Next action |
| --- | --- |
| Good joints, poor game recognition | Improve rule definition; then evaluate a small skeleton classifier if necessary |
| Bad wrist localization despite good lighting/crops | Compare model/input resolution; consider targeted pose fine-tuning only with labeled failures |
| Identity swaps during crossings | Improve abstention/association and test second-view benefit; do not train a posture classifier as a substitute |
| Fast-motion 3D required by a new game | Specify spatial/timing accuracy, validate synchronized/calibrated capture or depth hardware |
| Latency dominated by encode/display | Revise video/composition path; a smaller pose network alone may not help |
| Model distribution/runtime cannot be supported | Switch adapter/candidate while retaining the canonical observation contract |

Remaining installation questions are the exact camera models/modes, room/placement/lighting, host specs, intended player range and whether any future interaction truly needs depth or fingers. They do not block the initial 2D research recommendation. They do block hardware certification and a final performance commitment.

**Proposed next step:** implement M1-V1 and M1-V2, then make the model decision from the same one-player and three-player diagnostic evidence. Reserve custom training for a demonstrated recognition or localization gap.
