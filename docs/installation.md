# Installation and hardware validation

## Known and unknown

Two USB cameras are advertised as 4K at 60 fps. Exact models, supported pixel formats, simultaneous operating modes, exposure timestamp quality, synchronization support and drivers are unverified. The host may be Windows with an RTX 3070 or a Windows/macOS computer with integrated graphics. No hardware profile is certified yet.

Before choosing a deployment configuration, record camera model/serial, connection and controller topology, OS/driver versions, CPU/GPU/memory, display mode/refresh, available acceleration and room geometry. A model benchmark does not substitute for testing capture, decoding, inference and display together.

## Placement and coverage

The primary camera initially supplies the mirror image and initial game coordinates. Place it near the display where practical, checking perspective, body coverage and readability at the actual viewing distance. The secondary camera should observe useful alternate angles during three-player crossings. Choose baseline and angle from the room and overlap tests, not a universal mounting distance.

The displayed camera is a separate presentation choice. Changing it must retain the source's matching image geometry, overlay, timing and explicit mirror transform, without swapping calibration or reconstruction roles or restarting acquisition. An unavailable selected device must stay visibly unavailable. The [operator workspace](two-camera-workspace.md#choose-the-displayed-camera) rehearses this behavior with recorded synthetic views; physical planning and the current single-source games do not provide simultaneous live views.

Verify full reachable arm and body coverage for the intended player heights and motion envelope. Check partial overlap, deep overlap, image edges, spectators and nearby reflective surfaces. Confirm that target placement stays inside a physical play boundary and does not encourage contact with the screen or another player.

Capture a shareable installation diagram using synthetic figures and approximate dimensions. Real participant footage is local diagnostic data, not a repository asset.

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
