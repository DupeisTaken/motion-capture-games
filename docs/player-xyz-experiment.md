# Camera-free two-view XYZ experiment

## Scope and status

[Issue #4](https://github.com/DupeisTaken/motion-capture-games/issues/4) evaluates calibrated rig-meter XYZ independently of the [single-camera viewer](diagnostic-viewer.md) in [issue #3](https://github.com/DupeisTaken/motion-capture-games/issues/3). The earlier experiment in PR #7 was reverted by PR #9; the available discussion records no reason. This implementation reuses and reviews its geometry under the current repository environment and checks. It does not undo that revert wholesale or reinstate its obsolete project tools.

This is a synchronous, camera-free Python experiment. It opens no camera, imports no inference provider, changes no canonical wire schema and supplies no game input. Synthetic data can test reconstruction and rejection rules; it cannot certify calibration, synchronization, cross-view identity or physical accuracy. [ADR 0007](decisions/0007-camera-free-xyz-experiment.md) records this boundary. [The delivery report](../reports/vision-issues.html) and [results JSON](../reports/xyz-results.json) contain actual evidence.

## Methods and provisional gates

| Method | Work and tradeoff |
| --- | --- |
| DLT | Homogeneous SVD baseline minimizes algebraic image error. |
| Closest-ray midpoint | Intersects the closest points on calibrated rays with fixed work; nearly parallel rays remain poorly conditioned. |
| Reprojection refinement | DLT plus five damped Gauss–Newton iterations; accepts improving steps per point. Lower image error does not guarantee lower world error. |

Every method receives the same seeded observations and quality gates. There is no temporal smoothing, prediction, pairing wait or queue. The illustrative camera has a 1920 × 1080 ideal image, 1000 px focal length, 1.4 m stand height and 2 m baseline. These are synthetic assumptions, not negotiated 4K camera modes or a recommended physical layout.

The provisional targets from issue #4 are hip-midpoint p95 error ≤10 cm, wrist p95 ≤15 cm, ≥95% nominal root/wrist coverage, and reconstruction-stage p95 <5 ms for one and three people. Physical motion-to-visible p95 <100 ms remains a separate unmeasured target. A failing candidate remains failing in the report; implementation acceptance does not require manipulating those measurements. The candidate selection uses the smallest worst-workload p95 among methods passing every nominal spatial/coverage and stage gate, or returns no candidate.

The 10 November 2026 Windows run selected midpoint: nominal root/wrist p95 errors were 1.93/2.54 cm at 100% coverage, and three-person reconstruction p95 was 4.842 ms. The margin to the provisional 5 ms gate is small. Three-person DLT (5.238 ms) and refinement (15.941 ms) missed that gate in this run. These are serial host-specific stage measurements, not a guarantee of real-time physical performance. A 5% baseline scale bias still produced about 25 cm root p95 error with accepted output; falsely confirmed identity swaps also yielded incorrect XYZ. Full distributions, rejections and unsafe acceptances remain in the results/report.

## Geometry and provenance

`services/vision/motion_vision/xyz` uses `T_camera_from_rig = [R | t]`, with column-vector semantics. Rig coordinates are right-handed meters: floor/display-center origin, X screen-right as seen by the participant, Y up, Z into the play area. Anatomical joint names survive unchanged; mirroring belongs to presentation. Root XYZ is the midpoint of two accepted hips and is unavailable when either hip is unavailable.

Input pixels must already be upright, unmirrored and undistorted into the declared intrinsic matrix and calibrated image dimensions. The module neither calibrates cameras nor undistorts images. Calibration is tied to camera identity and image geometry; changing resolution, crop, focus or camera placement requires new verification and a new calibration revision.

Views carry explicit camera/frame IDs, calibration, mapping epoch, clock domain, integer nanosecond source times and uncertainties, timing-verification state, confirmed rig-track association, image dimensions and named joints. Output preserves source provenance and per-joint reasons. Invalid API metadata raises an actionable error; known quality failures yield missing positions. Finite negative/out-of-image pixels are rejected without clamping. Missing joints never become an invented default depth.

The caller supplies `now_ns` in the mapped source clock domain. Independently sourced counters must first be mapped with known offset, drift, epoch and uncertainty. Host read completion must never be called verified exposure time simply because it is monotonic. The experiment consumes a single pair; a future capture adapter must separately enforce bounded/latest-only pairing and reject reordered frames. Camera-local tracks, rig associations and session score owners remain different identities.

## Rejection and known blind spots

Pair gates reject calibration/epoch/clock mismatch, incorrect image geometry, uncorrected distortion, unconfirmed or mismatched rig identity, unverified exposure time, excessive combined time uncertainty/skew, future input and stale input. Limits apply to declared exposure intervals: skew includes both uncertainties, future checks use the latest upper endpoint, and age uses the oldest lower endpoint. Uncertainty cannot move an otherwise borderline pair outside the freshness budget unnoticed. The versioned [configuration](../configs/xyz-experiment.json) supplies thresholds with units.

Joint gates check finite input, image bounds, degeneracy, positive depth in both cameras, minimum ray angle, maximum closest-ray separation, either-view reprojection residual, estimated linearized error and the configured play volume. The error screen uses the smallest singular value of the stereo reprojection Jacobian plus a motion allowance propagated through the two-view geometry. This is an approximation using an assumed pixel-noise and speed model, not a calibrated confidence interval. One degenerate joint must not disable refinement for other valid joints.

Small reprojection error cannot prove scale or identity. A biased baseline or a wrong match falsely marked confirmed may still publish incorrect XYZ. The benchmark deliberately records those unsafe acceptances. The gate does not claim to detect unknown calibration drift, unmodeled lens distortion or upstream lies. Production use requires held-out physical references and validated identity/timing, rather than stronger assertions about the same synthetic inputs.

## Reproduce

Use the existing pinned Node/pnpm and uv-managed Python environment; no extra runtime dependencies or separate build system are required. A camera-free check environment needs `pnpm install --frozen-lockfile` and `uv sync --locked` as described in [CI conventions](continuous-integration.md). `pnpm setup` additionally downloads models, which this experiment does not need.

```text
pnpm benchmark:xyz
pnpm verify:vision
pnpm check
pnpm build
```

The benchmark writes `reports/xyz-results.json`. It runs scenario evaluation and stage timings serially with bounded BLAS threads. The committed configuration records seed, frame count, warmups, repetitions and trials. Accuracy denominators include requested missing/rejected joints; hip-root and wrist coverage are separate. Raw finite-pair errors and accepted-only errors are both reported. “Unsafe accepted” means a published joint exceeds its per-sample spatial tolerance; “wrong identity accepted” independently counts publication from deliberately wrong associations. Neither is hidden by accepted-only p95 statistics.

Scenarios include ideal/noisy inputs, short/wide/weak baseline, missing joints, outliers, skew, uncertainty, unverified timestamps, calibration rotation/scale bias, unmodeled distortion and flagged/unflagged identity swaps. One-/three-player stage timings include reconstruction, validation, allocation and quality gates after fixture generation, with warmups excluded. They exclude capture, inference, association, pairing, transport, rendering and display. Short serial microbenchmarks are host-specific; do not sum their percentiles to claim end-to-end latency.

`pnpm verify:vision` starts task-owned loopback servers and an installed browser, uses synthetic scenes through the real HTTP/WebSocket transport and saves screenshots/results under ignored `reports/local/vision-issues/`. It opens no cameras. Use `--chrome-executable` for an installed browser outside the detected paths. `--decode-delay --baseline 15a56dc` reproduces the viewer's old decode-freshness bug; `--decode-delay` verifies the correction using a 2-second artificial browser decoder delay on real synthetic JPEGs. This delay is a regression fixture, not measured hardware decoder performance. `--report-only` checks the generated offline report at three widths. `node scripts/vision-issues-report.mjs` summarizes selected committed JSON results and embeds screenshots so the report remains readable offline.

## Physical validation protocol: open

1. Identify both cameras, host/display, USB controllers, simultaneous negotiated modes, measured baseline/orientation and play volume. Keep serials and footage local. Inspect exposure and rolling-shutter behavior with both devices active.
2. Fit intrinsics/distortion at the exact resolution/crop/focus and metric extrinsics using a board of independently verified dimensions. Establish rig axes. Hold out calibration images and known-distance references; reprojection self-consistency does not verify scale.
3. Measure exposure offset, drift and uncertainty using hardware synchronization or an independent shared visible time reference. Include fast motion and full USB load. If timing misses the budget, suspend affected XYZ and change placement/sensors/synchronization rather than adding unmeasured buffering.
4. Measure at least 27 held-out static locations covering depths, edges and heights, 30 samples each, and three calibration/remount repetitions. Report XYZ-axis and Euclidean errors, coverage and every rejection per location. A moved camera must invalidate its old calibration.
5. Use an independent synchronized dynamic reference of known uncertainty. Test reaches, lateral/depth motion, reversals and holds with one and three participants, at least ten repetitions per scenario. Include crossings, occlusions, spectator entry, disconnects and recovery. Report per-joint p50/p95/p99, valid-update intervals, wrong associations and suspended observations.
6. Trace correlated full-pipeline samples, drops and resource use. Measure physical motion-to-visible feedback externally. Verify useful update rate and the <100 ms p95 target independently of the <5 ms reconstruction target.
7. Record supported scenarios and exclusions per rig/profile. Authoritative depth-dependent gameplay remains disabled until accuracy, coverage, timing and session identity gates have physical evidence. M1 hardware certification remains open.
