# Installation and hardware validation

## Known and unknown

Two USB cameras are advertised as 4K at 60 fps. Exact models, supported pixel formats, simultaneous operating modes, exposure timestamp quality, synchronization support and drivers are unverified. The host may be Windows with an RTX 3070 or a Windows/macOS computer with integrated graphics. No hardware profile is certified yet.

Before choosing a deployment configuration, record camera model/serial, connection and controller topology, OS/driver versions, CPU/GPU/memory, display mode/refresh, available acceleration and room geometry. A model benchmark does not substitute for testing capture, decoding, inference and display together.

## Placement and coverage

The primary camera initially supplies the mirror image and initial game coordinates. Place it near the display where practical, checking perspective, body coverage and readability at the actual viewing distance. The secondary camera should observe useful alternate angles during three-player crossings. Choose baseline and angle from the room and overlap tests, not a universal mounting distance.

The gameplay camera is a separate presentation choice; both camera diagnostics remain with the operator. Changing it must retain matching image geometry, overlay, timing and the explicit mirror transform, without swapping calibration or reconstruction roles or restarting acquisition. An unavailable selected device must stay visibly unavailable. The [operator workspace](two-camera-workspace.md#keep-operator-diagnostics-separate-from-gameplay) rehearses this separation with a genuine Slap a Mole runtime and explicit pointer input over a selected synthetic background. Physical planning and current live games do not provide simultaneous live views. Body-driven display switching requires a calibrated input/projection policy; an image-space score cannot simply be drawn over another camera angle.

Verify full reachable arm and body coverage for the intended player heights and motion envelope. Check partial overlap, deep overlap, image edges, spectators and nearby reflective surfaces. Confirm that target placement stays inside a physical play boundary and does not encourage contact with the screen or another player.

Capture a shareable installation diagram using synthetic figures and approximate dimensions. Real participant footage is local diagnostic data, not a repository asset.

### Virtual Maze: a practical two-camera setup

The `/maze.html` pre-game setup includes an illustrated camera-planning guide under the collapsed **Two-camera setup & accuracy guide** disclosure and a separate **Live floor calibration · cameras 1 → 2** tool. Current gameplay remains synthetic rehearsal; live setup acquires one camera at a time through the existing vision owner after explicit Start. `/rig.html` remains a planning/synthetic workspace. Neither page provides simultaneous physical paired acquisition or validated body/facing input. Use the following sequence, then keep physical maze input disabled until the independent evidence exists.

1. **Measure and label the floor.** Choose width and depth independently in 5..10 m and measure the rectangle. Mark `nearLeft`, `nearRight`, `farRight`, `farLeft` at each cone's floor contact, preserving physical correspondence in both views. Cone colors may be the same; human labels are valid planning. A cone tip or silhouette centroid is above the floor and is unsuitable for a floor-plane correspondence.
2. **Try two separated, oblique views.** Start outside the play boundary, aiming both cameras across the rectangle. Walk the near/far corners and center with a test target at floor, hip and head heights, then the intended movement envelope. Both views must cover the required volume, including feet, hips, head and raised arms where relevant. Change height, distance and aim together when edges or heads are clipped; a top-down floor sketch alone cannot prove this coverage. Camera A/B names are stable roles, not image left-to-right identity.
3. **Compare geometry and visibility.** Avoid a tiny baseline or almost parallel viewing rays over the useful volume. Increasing separation can improve triangulation conditioning but reduce overlapping coverage or cause self-occlusion. Check standing turns, head-only/torso-only turns, backward movement and a person blocking their own hips/face. A more frontal view can help orientation observations, while the other view can help depth/occlusion; verify the actual estimator instead of assuming it works. There is no universally correct mounting angle, baseline or camera height for an unverified lens and a 5..10 m room. This placement advice is an engineering inference from the calibrated projection geometry, to be tested on the actual rig. [OpenCV projection, stereo calibration and triangulation](https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html)
4. **Fix the capture geometry, then calibrate.** Identify both devices and negotiate actual simultaneous resolution, frame rate, crop/orientation and exposure. Lock mounts and focus/zoom where supported. Calibrate each camera's intrinsics/distortion using a rigid target of independently measured dimensions and varied board poses spanning the image. Estimate pair extrinsics from corresponding board observations in both views, covering useful depths/heights. Retain source image geometry, device identities and calibration revisions. Reprojection error is a calibration diagnostic; held-out known distances must independently establish metric scale. [OpenCV calibration workflow](https://docs.opencv.org/4.x/dc/dbb/tutorial_py_calibration.html), [OpenCV stereo calibration](https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html)
5. **Validate, then decide whether the rig is sufficient.** Verify exposure-time mapping/pairing and same-person association with both cameras active. Use held-out positions and an independent moving reference; test selected facing separately from position. Publish error distributions, accepted coverage, all rejections, useful update intervals and external motion-to-buzzer latency. If a room edge or turn is unsupported, revise placement or supported volume and repeat calibration/validation. Notes, photo labels and success checkboxes do not enable physical mode.

Use the existing [physical XYZ protocol](player-xyz-experiment.md#physical-validation-protocol-open) for its declared static/dynamic sample counts and remount repetitions. Add yaw/angular error and wrong-facing/front-back cases for **Head** and **Torso**, including head/torso disagreement, pitch, occlusion and stationary turns. Head orientation is not eye gaze. Evaluate directional wall-clearance error and wall/goal decisions against independent references as well as root XYZ; a correct hip position cannot compensate for the wrong facing direction.

Choose acceptable error, coverage and timing before physical trials from the actual corridor width, participant clearance and warning behavior. The experiment's root p95 ≤10 cm and physical feedback p95 <100 ms are provisional targets, not measured performance of this installation or sufficient proof for maze navigation. There is no accepted physical angular-error threshold yet. The current 0.20 m virtual contact margin and 2.4 m cue range are rehearsal tuning; they do not establish physical clearance or stopping distance.

A calibrated floor homography may map cone **floor contacts**. It cannot map elevated hips or heads as though they were on that plane. The implemented [guided live floor calibration](games/virtual-maze.md#guided-live-floor-calibration) fits four measured named corners and independently checks a known-length edge moved to near-left, centre and far-right with width/diagonal/depth orientations. Freeze a new live view for each placement. Check errors against both 0.10 m and 5%; centres must span both floor dimensions, and reference directions must exercise both axes. Stop and await camera 1 release before camera 2; choose a different device and preserve the same physical corner names. The software supports this manual fallback without automatic cone/marker detection or training.

Record the actual negotiated source mode and lock crop, rotation, focus and optical/digital zoom. Preview resolution is observed and revision-bound; unchanged-size lens/crop/mount changes require the operator's **Camera moved / lens changed** action because no lens telemetry or motion detector exists. Restarting a role requires fresh evidence. Failure guidance supports undo/re-mark, clear/repeat and acknowledged Stop retry. Distortion correction, intrinsics, stereo extrinsics and synchronization remain separate work; two independent floor fits do not establish these. Human photo annotations outside the live tool remain planning only. The [calibration report](../reports/playtest-maze-calibration.html) separates synthetic software checks from untested physical accuracy.

## USB formats and bandwidth

Enumerate the modes the camera actually exposes on each supported OS: resolution, frame rate, pixel format, compression and exposure controls. Measure delivered frame rate and frame age while both cameras are active. Stable device identity must use available serial/OS identifiers and an explicit operator fallback, not an assumed camera index.

Illustrative raw transport calculation for YUY2 at two bytes per pixel:

```text
3840 × 2160 × 60 × 2 cameras × 2 bytes = 1,990,656,000 bytes/second
```

This is approximately 1.99 GB/s before overhead. The actual cameras may compress output, changing bandwidth and decoding latency. Separate USB ports may share a host controller. Inspect controller topology and avoid assuming a hub adds bandwidth. [Multi-camera bandwidth guidance](https://docs.baslerweb.com/bandwidth-manager)

Check motion blur, exposure stability, lighting/flicker, autofocus changes and rolling-shutter effects. A nominal 60 fps mode alone does not establish low-latency useful tracking.

## Calibration and synchronization

Store calibration with rig ID, camera identities, resolution, crop/orientation, focus/zoom state where available, timestamp, tool/version and quality measurements. Keep local device identifiers in ignored `.local/` configuration; share only sanitized profiles.

For 2D primary-view play, verify image orientation, video/overlay transforms, viewport fit and reachable regions. For cross-view reconstruction, additionally determine intrinsics/distortion and camera extrinsics, with measured reprojection quality in the intended play volume. [OpenCV calibration and reconstruction](https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html)

Moving a camera, changing relevant lens settings, or changing image geometry requires calibration verification or invalidation. Do not apply a saved profile solely because a camera has the same model name.

If cameras expose hardware timing/synchronization, inspect and validate it. Otherwise software pairing has uncertain exposure alignment. Record offset, skew/drift, pairing tolerance and uncertainty. Derive an allowed time error from the fastest relevant motion and spatial error tolerance. For example, a hypothetical wrist moving at 3 m/s travels about 5 cm in 16.7 ms; this is an illustration, not a measured player speed or accepted tolerance.

Unsynchronized observations may still inform presence/association, but must not be advertised as validated fast-motion 3D. See [ADR 0003](decisions/0003-player-identity-and-multi-view.md).

## Installation and performance profiles

Installation profiles describe geometry and device roles. Performance profiles describe tested operating settings and capacity. Keep them separate so changing hardware settings cannot silently redefine game coordinates.

| Profile information | Required record |
| --- | --- |
| Hardware | OS, CPU/GPU, memory, display, cameras, controller topology and drivers |
| Capture | Actual negotiated formats, resolution/rate, exposure settings and timestamp quality |
| Inference | Model hash, provider, model input sizes, active view count and thread/resource limits |
| Gameplay | Player count, game/version, required joints and supported collision capabilities |
| Evidence | Test duration/workload, frame/pose timing, external latency measurement, identity/recovery results |
| Compatibility | Known exclusions, calibration version and validated quality settings |

The proposed first reference rig is Windows with an RTX 3070. macOS and Windows integrated graphics are separate candidates, not certified equivalents. Validate CPU correctness and compatible hardware acceleration paths. If a tier supports fewer players or lower video settings, publish that explicitly and enforce admission limits.

## Operator flow

Select the installation and performance profile; confirm both camera identities and negotiated modes; check preview and play boundary; verify calibration and overlay alignment; run a brief tracking check; then admit players. Camera loss or invalid calibration must produce a clear recovery path and pause policy. Package models/assets locally for offline operation.
