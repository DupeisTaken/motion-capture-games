# Two-camera player XYZ experiment

## Scope and evidence

[Issue #4](https://github.com/DupeisTaken/motion-capture-games/issues/4) is a partial M1 experiment on `codex/player-xyz-experiments`, independent of the skeleton viewer in [issue #3](https://github.com/DupeisTaken/motion-capture-games/issues/3). It adds runnable camera-free geometry, not a camera or inference service. The cameras are not connected. The user reports 4K cameras on stands 1.4 m high; models, spacing, lens parameters, USB modes and exposure timing remain unknown. No installation or full M1 gate is certified.

The accepted direction is to evaluate metric XYZ alongside motion tracking. The provisional targets agreed with the user are torso/hip-midpoint error p95 ≤10 cm, wrist error p95 ≤15 cm, reconstruction-only latency p95 <5 ms for up to three players, and the existing externally measured motion-to-visible p95 <100 ms. Require ≥95% nominal torso and wrist coverage so rejection cannot make an unusable algorithm appear accurate. These are experiment gates, not measured hardware results or final game tolerances.

See the [standalone report](../reports/xyz-experiment.html) and [full result JSON](../reports/xyz-results.json) for actual results, every scenario, percentiles, coverage and above-target accepted counts. A passing synthetic gate never enables authoritative 3D game input automatically.

Closest-ray midpoint was fastest in the final run. At 1 px nominal input noise it reached 1.93 cm torso and 2.54 cm wrist error at p95, with 100% coverage for both. Its three-player stage was 0.83 ms p95 in that run and 1.75 ms p95 in the earlier run. At 4 ms exposure skew, wrist coverage fell to 82%. At 2.5 m baseline, the simulated field of view clipped enough wrists to miss the 95% coverage gate. A 5% baseline scale error produced about 25 cm p95 torso error while passing the geometry checks for most joints.

## Methods and tradeoffs

| Method | Implementation and tradeoff |
| --- | --- |
| Linear DLT | Batched homogeneous SVD of two calibrated image rays. Simple baseline, minimizing algebraic rather than geometric image error. |
| Closest-ray midpoint | Midpoint of the closest points on two world rays. Low fixed work; weak or almost parallel rays remain ill-conditioned. |
| Reprojection refinement | DLT followed by five damped Gauss–Newton iterations minimizing pixel residuals, accepting only improving steps. More work; lower image residual need not mean lower real-world error. |

These are independent implementations using NumPy, not timings of OpenCV functions. The experiment selects the lowest worst-workload p95 among candidates passing every nominal accuracy/coverage and stage-latency gate; the result JSON records that run's selection. This is a geometry candidate, not a production model decision. The methods use identical seeded observations and common quality gates for a fair comparison. No temporal smoothing, prediction, pairing wait or frame queue is used. Smoothing would need a separate lag/accuracy comparison.

Dense stereo disparity requires image texture and matching evidence; it cannot be tested meaningfully using these sparse joint fixtures. A single-view neural pose's root-relative depth is useful body-shape evidence but does not establish absolute room location or metric scale. Neither is claimed to have been benchmarked here. [OpenCV's calibration and reconstruction reference](https://docs.opencv.org/4.13.0/d9/d0c/group__calib3d.html) supplies the pinhole/extrinsic and ideal-pixel triangulation conventions; [MediaPipe's output definitions](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker?tab=Python) distinguish hip-relative world landmarks.

## Geometry and input boundary

`services/vision/xyz` accepts paired anatomical joint observations already associated to one rig track. `Camera` holds `K` and `T_camera_from_rig = [R | t]`, using column-vector semantics. Input pixels must be upright, unmirrored and undistorted into the corresponding ideal intrinsic matrix. Real adapters must undo lens distortion first and invalidate calibration after resolution/crop/focus/position changes. This module does not estimate calibration or undistort raw images.

The output uses the existing right-handed rig convention: meters, origin on the floor at display center, X screen-right as seen by a participant, Y up, Z into the play area. Anatomical names survive reconstruction without mirror swaps. Player/root XYZ is the midpoint of two observed hips; if either hip is missing or rejected, root XYZ is unavailable. A floor homography is unsuitable for reconstructing hands above the floor.

Each view carries camera ID, source frame ID, calibration ID, synchronization epoch, mapped clock domain, source timestamp and uncertainty, timing-verification state, confirmed rig-track identity, image dimensions and named joint pixels. Reconstructed output retains both source frame IDs/times, calibration, epoch and rig identity. These are Python experiment types, not a new canonical wire protocol; integration must extend the owning versioned schema in `contracts` rather than hand-maintaining competing bindings. Session slots and scoring remain outside vision.

Pair-wide rejection covers calibration/epoch/clock mismatch, uncorrected distortion, ambiguous or mismatched identity, unverified exposure time, combined timing uncertainty >2 ms, pair skew >8 ms, future timestamps and oldest-view age >60 ms. The caller supplies `now_ns` in the declared mapped domain. Epochs mean a common mapping generation, not an assumption that independent cameras share device counters. No host-arrival timestamp may be marked verified merely because it is monotonic. The experiment consumes one pair synchronously and does not implement camera pairing, synchronization or association. Those adapters must enforce bounded/latest-only work and reject reordered source sequences.

Joint gates reject missing/out-of-image pixels (without clamping), degenerate/behind-camera estimates, ray angle <5°, ray separation >5 cm, either-view pixel residual >3 px, estimated linearized error >10 cm, or points outside the configured play volume. The first-order error screen uses the smallest singular value of the stereo reprojection Jacobian and assumed 1.5 px Gaussian localization noise, plus a 3 m/s motion allowance propagated through either view's stereo geometry. Depth can amplify timestamp error, so `speed × skew` alone is insufficient. This screen is an approximation, not a calibrated confidence interval; noise correlations, distortion, calibration drift, wrong association, acceleration and faster motion can violate its assumptions. Thresholds with units live in [the experiment configuration](../configs/xyz-experiment.json).

Rejection produces explicit reasons and missing XYZ, never an invented fallback depth or a transferred player identity. The 2D system may continue only under its own quality/capability policy. Reprojection cannot prove correct identity: an upstream match falsely marked confirmed can still pass geometric gates. Calibration scale errors can also have tiny reprojection residuals. Both failures are deliberately measured and remain release blockers for authoritative 3D input.

## Reproducing the experiment

Use Python 3.9+ to bootstrap the pinned uv 0.9.26 into `.local/bootstrap`; it installs pinned CPython 3.12.12 under `.local/python` and dependencies under `.venv`. No global Python, package-manager or shell configuration is changed. Initial setup needs the network; subsequent locked runs use the local environment. This isolated NumPy experiment does not select a pose-model runtime or add a TypeScript toolchain.

```text
python3 tools/project.py setup
python3 tools/project.py check
python3 tools/project.py experiment
python3 tools/project.py build
python3 tools/project.py dev
```

On Windows, use `python` in place of `python3`. `format`, `lint`, `typecheck` and `test` are also available. `build` generates the offline report, not a game application. `dev` serves repository files only on `127.0.0.1:8765`; open `/reports/xyz-experiment.html`. If the port is occupied, use `dev --port 8767`; leave the existing service running. Stop the task's own server with Ctrl+C. [uv's locking documentation](https://docs.astral.sh/uv/concepts/projects/sync/) describes the locked environment behavior.

The seeded workload uses 180 frames at a synthetic 60 Hz, three moving people with 17 joints each (9,180 joint pairs per scenario/method), varied depths, wrist motion and no learned detector. An ideal 1920×1080 pinhole with 1000 px focal length represents an illustrative processed image, not a negotiated 4K device mode. Reference height is 1.4 m and reference baseline 2 m. The 1.2 m, 2.5 m and 6 cm alternatives test sensitivity; no actual mounting change has been made or universally recommended.

Scenarios cover ideal and 1/3 px noise, alternate baselines, 4/16 ms skew, 10 ms uncertainty, host-arrival-only timestamps, 20% per-view missing joints, 10% per-view outliers, 1° extrinsic bias, 5% baseline scale error, unmodeled radial distortion, and flagged/unflagged identity swaps. Raw errors include finite input pairs before gates; accepted errors include only published joints. Coverage denominators include all requested joints; root/wrist coverage are reported separately. “Unsafe accepted” in JSON means accepted joints exceeding that joint's per-sample target, while acceptance targets themselves are p95; wrong-identity accepted joints are counted separately.

Stage timing includes all reconstruction/metadata checks, quality screens and array allocation for one or three sequential people, after input generation. Each of three trials discards 30 warm-up batches and measures 1,000 batches with a monotonic high-resolution host clock; report pooled p50/p95/p99, per-trial percentiles and measured duration. BLAS pools are limited to one thread. Camera capture, decode, inference, identity association, pairing, transport, rendering and display are excluded. Samples are microbenchmarks of a short workload on this Mac, with correlated frames and one seed; they do not establish 30 Hz useful observations, Windows/GPU performance or physical motion-to-visible latency. Do not add stage percentiles to claim end-to-end latency.

## Hardware validation protocol: still open

1. Identify both camera models, stable local device identities, measured baseline/orientation, room/play volume, USB controllers, OS/driver, CPU/GPU and display. Record simultaneous negotiated capture modes and rolling-shutter/exposure behavior. Keep serials and footage local.
2. Calibrate intrinsics/distortion at the exact image geometry and focus settings. Measure extrinsics and metric baseline with a board of verified physical dimensions. Establish floor/display rig axes. Hold out board views and 3D positions from fitting; reprojection alone cannot validate scale.
3. Measure offset, drift, exposure uncertainty and pairing age using a shared visible flashing/time reference, or validated device hardware synchronization. Test under motion and both cameras active. If timing cannot meet the geometric error budget, suspend fast-joint XYZ and evaluate hardware synchronization or different sensors rather than masking it with buffering.
4. Measure static points using a surveyed/physically measured reference at front/middle/back, center/edges and multiple heights throughout the intended volume. Use at least 27 held-out locations, 30 samples each, and three calibration/remount repetitions. Report XYZ-axis and Euclidean errors, bias, coverage and all rejections per location, not just pooled accepted error. A moved camera must fail calibration verification.
5. Establish dynamic wrist/hip ground truth with synchronized independent reference tracking of known uncertainty. Run reaches, lateral/depth motion, fast reversals and stationary holds with one and three players; repeat each scenario at least ten times, including crossings/occlusion, disconnect/reconnect and spectator entry. A tape measure or detector self-consistency cannot certify moving-joint accuracy. Report per-joint p50/p95/p99, valid-update intervals, identity ambiguity/recovery, incorrect associations and suspended observations.
6. Trace correlated capture-to-pose stage timing, drops, resource use and video alignment. Measure physical motion-to-visible latency externally with high-speed recording or an independently instrumented equivalent. Check ≥30 useful updates/s per player and p95 <100 ms visible feedback, in addition to p95 <5 ms reconstruction, without adding stage percentiles.
7. Pass the agreed error targets with ≥95% useful torso/wrist coverage on the declared supported scenarios and no observed wrong-slot scoring. Publish failures and exclusions per rig profile; repeat on Windows/RTX and integrated graphics separately. Keep M1 and authoritative 3D gameplay disabled until evidence passes. Raw calibration/participant recordings remain ignored local data.

If the baseline/overlap, localization error or synchronization misses these gates, adjust placement, inference resolution or sensors and rerun the full pipeline before adding a depth-dependent game. A wider baseline improves triangulation but can reduce shared coverage and make cross-view association harder. The report identifies this tradeoff without selecting a physical layout prematurely.
