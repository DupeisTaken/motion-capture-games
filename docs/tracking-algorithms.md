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
- Ambiguity retires implicated old IDs. Unseen retained tracks are also retired while ambiguity is present because they may be hidden in the uncertain group. Clearly associated, unaffected detections can keep their IDs.
- After separation, retired identities are not reconstructed by screen position. New tentative IDs are issued.
- A short clear absence may retain an internal candidate, but reacquisition restarts confirmation and is tentative. A long absence expires it.
- Restart/epoch changes clear history. Local IDs are meaningful only together with the stream epoch. Out-of-order or repeated timestamps are rejected.
- Zero accepted detections returns an empty list immediately. Internal lost-track retention never increases the visible count.

These are camera-local association states, not rig identity verification or session membership. No code here owns scores. Later scoring must independently require a valid session-slot association, sufficient joint quality and fresh observations. Complete occlusion or an unobserved crossing can make identity unobservable; more confident rendering must not hide that limit.

## Capacity and tuning

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
