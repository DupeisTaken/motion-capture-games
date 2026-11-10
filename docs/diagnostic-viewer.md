# Skeleton diagnostic viewer

This is the first runnable motion-input middle layer: one locally acquired image, named body joints, a skeleton overlay, camera-local associations and an automatic visible-person count. Games can later consume the same canonical observation boundary without opening a camera or knowing model landmark indices.

## Run it

Requirements: Node **24.21.0**, pnpm **11.25.0**, and an existing Python 3.9+ interpreter to bootstrap the pinned repository-local tools. The application uses Python **3.12.16**. Windows and macOS are intended targets; only the development environment named in the delivery report has been exercised.

```text
pnpm install --frozen-lockfile
pnpm setup
pnpm dev
```

Open **http://127.0.0.1:5173**. Setup creates `.venv/`, downloads the Python interpreter/tools under ignored `.local/`, and downloads verified model files into ignored `models/artifacts/`. It needs network access once. The application makes no model/CDN/cloud request during gameplay preview. A later `pnpm models` repairs or redownloads missing artifacts.

The server does not open a camera on startup. In the viewer, choose **Camera**, optionally discover/identify a browser camera as described below, then set its **Native camera index** (0 is the initial operator fallback), select a pose model and association mode, then choose **Start camera**. OS camera permission may be needed for the host process. Use **Stop** to release capture. Hiding the browser tab stops the preview; returning requires an explicit restart. Closing the last viewer also releases its source. This is a single-operator diagnostic service; multiple tabs share one source.

Choose **Synthetic scene** to inspect rendering and the contract without a camera. The three-body, empty, and entering/leaving scenes generate observations directly: they do not measure either pose model's detection quality. They are clearly labeled in the UI and canonical payload.

## What appears on screen

- A mirrored preview with named-joint bones, joint dots and optional person bounds. The image, boxes and joints share one aspect-preserving transform; anatomical left/right never changes.
- Automatic count of the detections in the current source image. Retained/lost tracks do not add people. A detection is not an enrolled game player.
- At most the configured 1–6 detections. If the model returns the configured maximum, the UI warns that more people may exist. This is a processing cap, not a measurement of total room population or certified game-player capacity.
- Camera-local track labels, with tentative/ambiguous states. Uncertain identities do not receive an asserted track ID. There is no face recognition or persistent personal identity.
- A display confidence threshold that hides unsupported joints/bones. Scores are model outputs, not calibrated probabilities. Filtering a joint does not reduce the detected-person count.
- Measured per-frame inference duration, received preview-update rate, source-image geometry and skipped capture count. These are not external motion-to-visible latency measurements.

## Algorithms

The selectable pose adapters implement **MediaPipe Pose Landmarker Lite** and **RTMDet-nano + RTMPose-m exported ONNX**. The latter uses the official CPU archive's exact normalization, top-down affine crop and SimCC decoding. Both export the same COCO17 anatomical names. The adapter owns all model-specific indices. Models are fixed for this experiment, not a final winner for the product.

Association options are **box overlap** and **pose assisted**. They are lightweight project implementations, not stock ByteTrack. See [tracking algorithms](tracking-algorithms.md) for matching, abstention, short-gap retention and provisional tuning. Complete occlusion and visually similar people can still defeat association; the viewer shows uncertainty rather than inventing continuity. No game score or slot ownership is implemented.

## Paired-frame transport

The provisional full-product WebRTC path remains unselected. This diagnostic slice deliberately publishes each inference image together with its own observations so alignment can be inspected without matching independent media clocks:

```text
uint32 big-endian metadata length | UTF-8 observation JSON | JPEG image
```

Metadata is capped at 64 KiB and JPEG at 2 MiB. The JPEG and normalized joints describe exactly the same resized image. The frontend validates the schema, source epoch, sequence, byte bounds and decoded image dimensions before drawing. It closes replaced image bitmaps and rejects late decode results after stop/restart.

Capture has one owner, one latest pending frame, one inference worker and one latest published packet. The client requests its next packet only after decoding/rendering the previous one. This avoids a reliable frame backlog and prefers current results. It does not guarantee a camera driver has no internal buffering. The preview follows inference cadence; there is no independent high-rate video path. It is a diagnostic experiment, not a certified low-latency production transport.

Capture time is labeled **host read completion**. Exposure timing is unknown. Source monotonic nanoseconds travel as decimal strings to preserve integer precision in JavaScript. The service discards camera frames older than 500 ms in its own clock. The browser also clears its overlay after 1.5 seconds without a received frame. Both limits apply to this diagnostic viewer. Gameplay freshness thresholds still need measurement.

See [ADR 0005](decisions/0005-diagnostic-skeleton-slice.md) and [canonical contract](../contracts/README.md).

## Checks and developer commands

```text
pnpm contracts:generate
pnpm contracts:check
pnpm typecheck
pnpm lint
pnpm test
pnpm format
pnpm format:check
pnpm build
pnpm check
```

`pnpm check` runs schema drift, TypeScript/Python types, ESLint/Ruff, Vitest/pytest and formatting checks. `pnpm build` produces the frontend in `dist/mirror/`. Run `pnpm vision` in one terminal and `pnpm preview` in another to serve that build on port 4173. Start and stop commands use Node across Windows and macOS. `pnpm dev` manages its own two child processes.

Tests use synthetic observations, fake captures and local HTTP/WebSocket clients. They check transforms, absent joints, bounded packets, ordering/restarts, counting, ambiguous association and capture/resource recovery. Model smoke checks and physical camera trials are separate evidence; consult the delivery report rather than assuming these passed from a unit-test result.

## Remaining M1 work

This slice does not implement two-view association, calibrated 3D, player-slot enrollment, game collisions, external latency instrumentation, hardware-profile certification or production packaging. Camera indices are an explicit temporary operator selection, not stable device identity across restarts. Real one-/three-person crossings and supported camera/host modes must be measured before selecting the production model or declaring M1 complete. See [roadmap](roadmap.md).

Work is tracked in [issue #3](https://github.com/DupeisTaken/motion-capture-games/issues/3), following the [research proposal](vision-research.md).

## Compact test console and camera setup

[Issue #15](https://github.com/DupeisTaken/motion-capture-games/issues/15) tracks this iteration; [the console report](../reports/diagnostic-console.html) owns actual checks and measurements. Independent high-rate preview remains in [issue #10](https://github.com/DupeisTaken/motion-capture-games/issues/10); physical M1 gates remain open.

The responsive single-page console places input/pipeline controls, preview, detections, twelve performance fields and stream context side by side on desktop. Narrow screens stack the same information with scrolling. Current model, camera/tracker, frame/epoch, clock quality, transform and calibration remain visible beside performance readings.

### Explicit camera permission and selection

1. Choose **Allow & discover cameras**. Only this action requests browser camera access; audio is disabled. Discovery requires localhost/HTTPS and an available vision service. Stop any active diagnostic source first, including another tab's preview.
2. Grant browser access to reveal camera names. The discovery stream is released after enumeration. Choose a **Browser camera reference** and **Identify** to inspect that exact device temporarily. **Release browser camera**, source changes, hiding/closing the page and starting native capture release its tracks. A late permission result is also released after setup is invalidated.
3. Set the **Native camera index** and start the diagnostic. Verify the physical view and correct the index after stopping if needed. Browser IDs/order are not OpenCV indices: no automatic mapping or persistent device identity is claimed. Only one native camera is active in this slice.

Browser permission does not grant Python/OS camera permission. Denied access, unavailable/busy devices and missing browser APIs show recovery guidance; native index selection remains available. Camera labels, browser IDs and setup video are not persisted or included in reports. API behavior follows the [Media Capture and Streams specification](https://www.w3.org/TR/mediacapture-streams/).

### Reading performance diagnostics

The rolling window contains at most 120 received frames; telemetry refreshes at most every 250 ms. Preview rate measures received paired updates, not display refresh or exposure rate. Source processing includes resize/inference/tracking/JPEG encoding but ends before packet validation/serialization. Its p95 is a nearest-rank percentile over the rolling window. Read-to-processed subtracts timestamps in the source clock, including time between host read completion and processing completion.

JPEG + validation measures browser packet validation and JPEG decoding. Canvas draw measures synchronous draw submission, excluding screen presentation. Last arrival age uses only browser time and is cleared with stale observations. Packet size includes metadata and JPEG. Inference shows **n/a** for generated scenes. These fields cannot establish physical motion-to-visible latency, exposure timing or model accuracy.

On Python 3.12/Windows, `monotonic_ns` can have 15.625 ms resolution. Capture and runtime now share `perf_counter_ns`, a high-resolution monotonic host clock, so short stages no longer round to zero. The wire clock remains host-monotonic; source epochs remain the history boundary. Raw timestamps from different clock implementations or the browser must never be mixed. See [Python's clock reference](https://docs.python.org/3.12/library/time.html). Synthetic input targets 20 Hz using fixed deadlines, skipping missed ticks instead of accumulating sleep overshoot or queuing catch-up frames. Camera cadence and the production video-path decision are unchanged.

Person rows are retained while displayed identity, joint count and capacity stay unchanged. Positions still redraw the paired canvas on every received frame. The sample window and existing one-frame queues remain bounded.
