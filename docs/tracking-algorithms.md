# Camera-local tracking and automatic person count

The diagnostic viewer counts the **current accepted person detections** and draws their current skeletons. It does not ask an operator to enter a person count, count retained tracks as visible people, or enroll detected people as game players. A detector can miss, merge, duplicate or falsely detect a person, so this is a detected-person count rather than guaranteed physical occupancy.

The implementation is [tracking.py](../services/vision/motion_vision/tracking.py). It operates on named, normalized, unmirrored observations from either pose provider. It has no camera, model or game dependency. Follow the broader [multiplayer identity design](multiplayer.md) when adding rig association or player slots later.

## Two selectable association algorithms

| Mode | Evidence used | Purpose and limit |
| --- | --- | --- |
| `iou` | Last-observed and predicted person-box overlap, with elapsed-time-aware center distance | A small motion/geometry baseline; cannot distinguish similar people through an unobserved crossing |
| `pose` | The same box/motion gates plus visible joint-shape distance after centering/scaling | Evaluates whether reliable pose geometry helps association; falls back to box/motion when too few joints are reliable |

These are repository-specific diagnostic algorithms. They are **not implementations of SORT or ByteTrack**. SORT describes Kalman prediction and assignment; ByteTrack introduces a distinct association strategy using low-score detections. Those papers motivate comparison, but this implementation has neither their full tracker nor their reported benchmark results. [SORT paper](https://arxiv.org/abs/1602.00763), [ByteTrack paper](https://arxiv.org/abs/2110.06864)

Both modes use bounded, exact one-to-one minimum-cost assignment with an explicit unmatched choice. Each chosen match is also tested against the best alternative assignment with that match forbidden. This catches globally tied or nearly tied assignments even if individual rows and columns have clear local minima. Affected observations become ambiguous rather than taking whichever optimum appeared first. The solver uses memoized bitmask states, with at most six current detections and twelve retained tracks, rather than another numerical dependency. A minimum-cost assignment only optimizes its supplied costs; it does not prove identity.

Assignment is evaluated independently against the last observed boxes and against their bounded motion predictions. When those two views support competing feasible associations for a person, the affected observations become ambiguous and implicated IDs are retired. Prediction may help compare motion, but cannot overrule contradictory observed-position evidence. An isolated predicted match remains usable when the last-observed geometry has no competing feasible match. Both evaluations use the same capacity bounds and explicit unmatched choice.

The baseline cost combines box-overlap distance (weight 0.70) and gated center distance (0.30). When at least four reliable common joints exist, pose mode uses box distance (0.50), center distance (0.30) and normalized joint-shape distance (0.20). These weights are provisional diagnostic tuning, not learned or installation-certified values. Pose comparison only uses observed, in-frame, finite body joints above its score threshold. Facial landmarks are excluded, and each common body-point set must span at least 0.15 of its person-box diagonal; collapsed keypoints do not count as pose evidence. Estimated, missing, out-of-frame and low-score joints cannot provide pose-association evidence. Source scores are not calibrated correctness probabilities.

The short, bounded velocity estimate predicts a **box for association only**. Its update weight is `1 - exp(-elapsed_seconds / 0.15)`, using a provisional 0.15 s time constant. A short noisy interval therefore has less influence than it did with the former fixed 50% update per processed observation. This avoids giving the same displacement a disproportionate effect on the predictor when sample intervals change. It never inserts a hidden person, joint, trail or collision into published output. The returned detection order matches the accepted input order, but identity is determined by association, not that order or horizontal position.

The identity-switch failure addressed here was a prediction-driven reassignment: a small box disturbance could change estimated velocity enough that an extrapolated box favored a neighboring person, even while the last observation supported a different association. Global assignment margins alone could still call that prediction-based answer clear. The independent observed-position comparison makes this conflict explicit. Abrupt approaches or direction reversals can now produce a conservative loss of identity continuity; after recovery, a new ID is preferable to silently moving an established ID to another person. This change stabilizes association decisions, not the coordinates of the drawn skeleton.

## Identity and uncertainty

- A new track is `tentative`. Three consecutive clear matches produce the local diagnostic label `confident`.
- Close overlapping boxes, near-tied matching candidates or competing feasible observed-position and predicted-position assignments produce `ambiguous`, with `trackId: null`. The observed skeleton is still displayed and counted; its former identity is not asserted.
- Ambiguity retires spatially implicated old IDs. Implication uses feasible observed/predicted association, actual old-box overlap, or the elapsed-time center gate around observed/predicted centers. It does not use the maximum 0.30 gate at every frame interval. Before reassignment, uncertainty propagates to current detections that any retired row could feasibly explain, repeating to capacity-bounded closure. Removing a plausible owner therefore cannot manufacture a clear match to somebody else. An isolated, unaffected incumbent can keep its ID even when a separate spectator group overlaps. Missing candidates outside that group's reachable geometry retain only their existing 0.45 s lifetime; reacquisition still restarts confirmation.
- After separation, retired identities are not reconstructed by screen position. New tentative IDs are issued.
- A short clear absence may retain an internal candidate, but reacquisition restarts confirmation and is tentative. A long absence expires it.
- Restart/epoch changes clear history. Local IDs are meaningful only together with the stream epoch. Out-of-order or repeated timestamps are rejected.
- Zero accepted detections returns an empty list immediately. Internal lost-track retention never increases the visible count.

These are camera-local association states, not rig identity verification or session membership. No code here owns scores. Later scoring must independently require a valid session-slot association, sufficient joint quality and fresh observations. Complete occlusion or an unobserved crossing can make identity unobservable; more confident rendering must not hide that limit.

## Capacity and tuning

MediaPipe constructs person bounds from its body landmarks, excluding optional facial and finger landmarks. Face disappearance or a displaced face estimate therefore cannot move the body association box or admit a face-only detection. Out-of-frame body coordinates remain explicit and unclamped. This does not restore an invisible torso, infer a hidden wrist, or establish measured side/back-facing pose accuracy. RTMPose continues to use its detector box; neither adapter changes anatomical left/right on a turn.

The provider's person cap bounds computation; it is not a selected number of participants. `detectedCount` is the number of returned current observations. The service can report `capacityReached` when that count reaches the configured cap, warning that additional people may be missed. No claim is made that a detector returning fewer people has seen everyone.

Provider ranking changes at capacity can change which people reach the tracker. This fix does not reserve detection capacity for an incumbent person or add an enrolled-player lock. A different person producing indistinguishable box/pose evidence can still receive the same association; geometry alone cannot prove that a physical person remained the same. Those cases require separate evidence or an explicit session recovery policy, not a claim that local labels are personal identity.

`TrackingConfig` keeps tuning together with its units and rationale:

| Setting | Initial value | Meaning |
| --- | --- | --- |
| Current detection cap | 6 | Bounds diagnostic assignment work; the caller may choose a lower cap |
| Retained track cap | 12 | Bounds internal missing-track state; retained tracks are not published |
| Retention interval | 0.45 s | Provisional maximum age of a matching candidate |
| Clear confirmations | 3 observations | Avoid declaring a fresh match locally confident on one frame |
| Joint score threshold | 0.45 | A source-score gate for pose evidence, not a probability guarantee |
| Minimum common body joints | 4 | Avoid claiming pose support from one or two joints or face-only observations |
| Minimum pose extent | 0.15 of box diagonal | Reject collapsed body geometry even when source scores are high |
| Center gate | 0.08 + 1.2 × elapsed seconds, capped at 0.30 | Normalized-image distance allowed for association |
| Prediction horizon | 0.15 s | Bounds extrapolation used only for box matching |
| Velocity bound | 1.5 normalized image units/s per axis | Limits the association predictor after abrupt changes |
| Velocity time constant | 0.15 s | Makes velocity updates depend on elapsed source time rather than processed-frame count |
| Maximum matching cost | 0.78 | Higher-cost pairs remain unmatched |
| Near-tie margin | 0.08 cost units | Abstain when competing candidates have similar support |
| Overlap ambiguity | Box IoU ≥ 0.40 | Conservative abstention for strongly overlapping current person boxes |

These thresholds need measured tuning on a development subset, then evaluation on untouched participant/session-separated sequences. Normalization avoids dependence on pixel resolution, but does not make thresholds invariant to camera aspect ratio, participant scale, placement or frame rate. No threshold here certifies three-player gameplay or a hardware profile.

## Integration

```python
from motion_vision.tracking import Tracker, TrackingConfig

tracker = Tracker(mode="pose", config=TrackingConfig(max_detections=6))
people = tracker.update(detections, timestamp_ns=source_time_ns, epoch=stream_epoch)
detected_count = len(people)
```

Detections contain a `box` with normalized `x`, `y`, `width`, `height`, and a `joints` map from canonical names to joint coordinates, source score, status and in-frame flag. The function returns copies augmented with `trackId` and `identity`; it does not mutate provider output. Non-finite or non-positive boxes are omitted. Valid out-of-frame box coordinates remain out of frame; they are not clamped onto a visible edge. Inputs over capacity are rejected rather than silently truncated. The same tracker instance must receive only one camera stream and one chosen association mode at a time.

The service owns detector filtering, camera frame freshness and the schema validation boundary. It must pass source-time nanoseconds with monotonic ordering, set the current count from the returned list and create/reset tracker state on source, provider, geometry or epoch changes. A changing display mirror does not change anatomical joint names or camera-coordinate tracking.

## Verification scope

The [synthetic behavior tests](../services/vision/tests/test_tracking.py) cover current counts of zero, one and three; detection-array reordering; confirmation; ambiguous overlap and merged observations; absence/reacquisition; epoch changes; local and global assignment ties; unusable, collapsed or face-only joints; immutable provider data; invalid boxes; capacity and timestamp rejection. They exercise both association modes where relevant. The implementation report owns the actual executed checks and results.

Synthetic tests do not establish field accuracy, comparative pose-mode improvement, identity preservation through every crossing or camera capacity. M1 still needs the [real crossing scenarios](multiplayer.md#required-diagnostic-scenarios), detected-count error/coverage, ambiguity/recovery durations and full-pipeline measurements on each supported profile.

The identity-stability regressions target small box disturbances, irregular source intervals, and nearby people whose observed-position and predicted-position assignments conflict. Validation must also check unaffected tracks, detection-order changes, empty frames and recovery after retirement. Actual executed results belong in the change report; these scenarios do not certify physical identity preservation.

Reproduce the before/after synthetic identity cases and serial tracker-only timings from the repository root after installing the local Python environment:

```text
python services/vision/tools/tracking_stability.py
```

Use `.venv/Scripts/python.exe` on Windows or `.venv/bin/python` on macOS when the environment is not activated. The tool compares the immutable pre-fix commit recorded in its source with the current tracker, alternates detection order, and writes [the result JSON](../reports/tracking-stability-results.json). Its timing workload uses three or six separated moving boxes, 20 warmup updates and 100 measured updates per mode by default; it excludes camera, model, transport and rendering work. Synthetic subject labels establish the reference identity only for these fixtures.

[Issue #11](https://github.com/DupeisTaken/motion-capture-games/issues/11) tracks this focused fix. The [tracking stability report](../reports/tracking-stability.html) records its implementation, executed verification and remaining limits.

## Playtest continuity evaluation and bounded session memory

[Issue #61](https://github.com/DupeisTaken/motion-capture-games/issues/61) and the [playtest tracking report](../reports/playtest-tracking.html) cover the subsequent spectator/turn/working-memory repair. Games can opt into the [single-player recovery contract](../packages/session/README.md#bounded-same-track-recovery) without changing the observation wire schema. The session remembers one explicit association token and two clock references for at most 450 ms since its last fresh confident input. It stores no images, clothing signatures, facial features, body measurements or joint snapshots. The tracker already keeps bounded recent body observations for geometry matching; estimated/missing joints remain unusable as observed input.

Body geometry is useful during an observable narrow or unilateral pose, so synthetic turns exercise fewer than four usable common joints and the geometry fallback. A token or old torso sample cannot justify giving a **new track ID** an old slot. A clothing cue would require new pixel sampling, nuisance/lighting/turn tests, bounded retention and participant/session-separated false-match evidence; it is deliberately not introduced without that evidence. Complete occlusion, retired IDs and indistinguishable replacement still require explicit rejoin. The 450 ms ceiling is a provisional bound inherited from tracker retention, not a measured optimal setting.

Run the camera-free, tracker-only fixture comparison with the local Python environment:

```text
.venv/Scripts/python.exe services/vision/tools/tracking_continuity.py --baseline-ref 2cea8d7033a8be02f4f9d7079ecc0e6ca676a6fa
```

Use `.venv/bin/python` on macOS/Linux. This writes [synthetic aggregate results](../reports/playtest-tracking-results.json). It alternates detection order and measures an isolated incumbent beside overlapping spectators, a short missing frame beside that group, sparse narrow turns, and genuine ownership overlap. It does not execute either pose model or a game. Metrics use explicit reference subject labels, withheld from tracking, and per-frame `durationMs`:

- **Continuity coverage:** time with fresh confident original incumbent ID divided by all evaluated reference-subject time, including missing, tentative and ambiguous samples. Warmup (`evaluate: false`) is excluded. A fresh new ID still loses original-slot continuity.
- **Confident wrong association:** emitted confident IDs previously attached to a different labelled subject, including spectators outside the target set; count and labelled observation-duration are separate from coverage.
- **Ambiguous duration:** evaluated target-subject time explicitly marked ambiguous. Missing and tentative samples additionally count toward suspension.
- **Suspension/recovery:** all target-subject time without original confident continuity, maximum uninterrupted span, completed recovery spans and unresolved subjects at the end. Freezing throughout yields zero continuity, not perfect correctness.

For local held-out evaluation, put normalized labelled provider observations in ignored `.local/heldout-tracking.json` (or `datasets/`), then run:

```text
.venv/Scripts/python.exe services/vision/tools/tracking_continuity.py --input .local/heldout-tracking.json --output .local/heldout-tracking-results.json
```

The JSON root maps local sequence names to arrays of frames. Each frame contains `atMs`, positive `durationMs` (up to 1000), `expected` reference subject labels, and `detections`: `{ "subject": "anonymous-reference-label", "detection": { "box": { "x": 0.35, "y": 0.15, "width": 0.1, "height": 0.65 }, "joints": {} } }`. Use an empty detection array during reference-labelled absence and `subject: null` for an unlabelled false detection; label all people when measuring wrong association. Optional `epoch` records source resets. Labels must be unique within a frame. Each batch is bounded to 16 MiB and 10,000 frames; detection and retained-track bounds remain unchanged. Input/output must stay in ignored paths; aggregate output replaces sequence names with ordinal names and never includes coordinates or reference labels. Human validation of annotations and source timing remains necessary.

Freeze the existing pretrained RTMPose and MediaPipe artifacts and current thresholds first; separate development/tuning clips from held-out participants, sessions and clothing/lighting conditions. Include front/side/back turns, fast reach, peripheral framing, partial/full occlusion and spectator replacement. Record joint visibility/error, count coverage, wrong-ID events, suspension and recovery alongside end-to-end timing. The local route consumes labelled provider observations, so capture/model failures must also appear as absent or low-quality detections; it does not perform media annotation or model inference itself. No participant footage or labelled clips were supplied for this change, and no training or GPU benchmark ran. A 99% field-continuity claim requires that distinct held-out evidence, not these regression fixtures.

Secondary views should first demonstrate that a hidden body becomes observable from the proposed placement. Their observations cannot authorize cross-view identity or replace hidden primary joints without calibrated geometry, source-time evidence, correspondence and an uncertainty policy. Disconnect, bad calibration and timing mismatch must be evaluated before any fusion. This repair makes no synchronized/calibrated cross-view identity claim.

### Separate throughput and model-robustness follow-up

The current RTMPose adapter explicitly requests `CPUExecutionProvider` for both ONNX sessions, and the locked environment includes CPU `onnxruntime`. This path does not use the available RTX 4070. Slow inference can widen source gaps and reduce continuity opportunities; an association bug and a throughput bottleneck need separate measurements. This change neither installs GPU packages nor claims GPU acceleration or training results.

Issue-ready acceleration experiment: record the current model hashes, provider, input sizes, visible-person count, per-stage p50/p95 latency, skipped/expired work and output joint agreement using the same consented labelled clips; create a separate ignored local GPU environment with explicitly compatible runtime/driver dependencies; compare the same model/output contract sequentially under the campaign resource limit. Verify actual execution-provider placement and CPU fallback, bound queues and threads, and retain CPU portability. Keep preprocessing/decoding constant. Adopt acceleration only if observed latency improves without unacceptable output regressions. This does not itself recover identity hidden by a new ID.

Training needs consented, labelled varied-view body joints and visibility plus anonymous association truth through turns/occlusions/replacements, enough participant/session variation, dataset/checkpoint license and privacy handling, and an untouched held-out split. Measure the pretrained baseline failures first. Capacity, framing, exposure and score-quality problems may require capture or policy fixes rather than training. No such footage/labels were supplied, so training is deferred.
