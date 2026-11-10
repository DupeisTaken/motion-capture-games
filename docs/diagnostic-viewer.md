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
- Automatic count from the latest fresh pose observation, which may lag the independent camera image. Retained/lost tracks do not add people. A detection is not an enrolled game player.
- At most the configured 1–6 detections. If the model returns the configured maximum, the UI warns that more people may exist. This is a processing cap, not a measurement of total room population or certified game-player capacity.
- Camera-local track labels, with tentative/ambiguous states. Uncertain identities do not receive an asserted track ID. There is no face recognition or persistent personal identity.
- A display confidence threshold that hides unsupported joints/bones. Scores are model outputs, not calibrated probabilities. Filtering a joint does not reduce the detected-person count.
- Separate measured render, camera/source and pose rates, per-observation inference duration, source-image geometry and skipped capture count. These are not external motion-to-visible latency measurements.

## Algorithms

The development default is **RTMDet-nano + RTMPose-m exported ONNX**, selected following the user’s live comparison. **MediaPipe Pose Landmarker Lite** remains an optional comparison baseline. The RTMPose adapter uses the official CPU archive's exact normalization, top-down affine crop and SimCC decoding. Both export the same COCO17 anatomical names. The adapter owns all model-specific indices. Models are fixed for this experiment, not a final winner for the product.

Association options are **box overlap** and **pose assisted**. They are lightweight project implementations, not stock ByteTrack. See [tracking algorithms](tracking-algorithms.md) for matching, abstention, short-gap retention and provisional tuning. Complete occlusion and visually similar people can still defeat association; the viewer shows uncertainty rather than inventing continuity. No game score or slot ownership is implemented.

Both modes compare assignments from last-observed positions with assignments from bounded motion predictions. Competing feasible associations produce **Identity needs recovery** and remove the affected asserted track IDs while continuing to show and count current skeletons. Elapsed-time-aware velocity updates reduce the effect of short box disturbances. A sudden approach or reversal may therefore interrupt an ID instead of carrying it onto a neighboring person. The viewer does not lock an enrolled participant, and detector ranking changes at capacity or indistinguishable replacements remain limitations; this is not coordinate smoothing or guaranteed reidentification. [Issue #11](https://github.com/DupeisTaken/motion-capture-games/issues/11) and the [tracking stability report](../reports/tracking-stability.html) track this follow-up.

## Independent preview and display timing

The viewer uses one camera owner and three independent cadences: camera capture, pose processing, and display rendering. A `requestAnimationFrame` loop draws the latest decoded image at the display’s refresh rate; image delivery and inference do not schedule draws. It never creates new camera exposures or pose measurements. A 60 Hz screen caps this loop at approximately 60 FPS; a faster display can run faster. Hidden tabs stop the source, and Stop cancels animation work.

The loopback service supplies two bounded pull streams:

- `/api/preview`: four-byte big-endian metadata length, UTF-8 [preview metadata](../contracts/schemas/preview.schema.json), then a JPEG. One independent encoding worker reads the same capture owner’s latest frame, even during slow inference. Preview metadata retains its own epoch, sequence, geometry and source-monotonic timestamp.
- `/api/observations`: JSON canonical observations from the inference worker, retaining the actual inference image’s timestamp. The browser never decodes an image on the pose channel.

The original `/api/stream` exact paired-image endpoint remains available for diagnostics and existing clients. This does not select the provisional production WebRTC path. Metadata stays bounded to 64 KiB and JPEG to 2 MiB. Capture, inference publication and preview publication each retain only current work; each stream requests its next item after consuming the previous one. Slow readers skip superseded frames. Both viewer connections include the acknowledged source epoch, so a delayed old connection cannot acquire ownership of a replacement source.

The same contain-fit/mirror transform is applied to video and geometry. A pose overlay is held only when epochs, source and geometry match and its source image is **0–150 ms older** than the displayed image. Newer-than-image poses and larger gaps are hidden; the UI reports the gap. No interpolation, prediction or scoring input is invented. Pose results expire locally after 500 ms without updates; camera imagery expires after 1.5 seconds without a received frame. The service rejects source frames older than 500 ms. These are provisional diagnostic guards, not gameplay thresholds or exposure-alignment certification.

The **Render FPS**, **Camera / source FPS**, **Pose FPS**, **Overlay gap** and inference time are separate. Render FPS counts actual animation-loop draws, including redraws of an unchanged camera image. Camera rate is an aggregate capture-count/time ratio over a bounded source-clock window, not a requested camera setting or an average of instantaneous inverse intervals. This avoids inflating the rate when a driver releases frames in bursts. Pose rate counts received unique observations. The person list and telemetry update at 4 Hz to keep DOM work off the frame loop. Synthetic scenes label their generated source rate explicitly; none of their figures establish camera/model performance.

Capture time remains **host read completion**, not verified exposure time. Backend nanoseconds travel as decimal strings; only timestamps in the same backend clock are subtracted. No browser/backend clock subtraction is used to claim external latency. See [ADR 0006](decisions/0006-independent-preview.md), [canonical contract](../contracts/README.md) and [performance report](../reports/preview-performance.html).

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
pnpm benchmark:runtime --samples 200 --models
pnpm benchmark:preview --duration 30000 --warmup 5000 --scale-factor 2
```

`pnpm check` runs schema drift, TypeScript/Python types, ESLint/Ruff, Vitest/pytest and formatting checks. `pnpm build` produces the frontend in `dist/mirror/`. Run `pnpm vision` in one terminal and `pnpm preview` in another to serve that build on port 4173. Start and stop commands use Node across Windows and macOS. `pnpm dev` manages its own two child processes.

Tests use synthetic observations, fake captures and local HTTP/WebSocket clients. They check transforms, absent joints, bounded packets, ordering/restarts, counting, ambiguous association and capture/resource recovery. Model smoke checks and physical camera trials are separate evidence; consult the delivery report rather than assuming these passed from a unit-test result.

The opt-in benchmarks run serially. `benchmark:runtime` compares reference/compiled validation on synthetic observations; `--models` also times fixed detector/pose tensors without accessing a camera. `benchmark:preview` opens an installed Chrome/Chromium, runs a generated three-body scene, records actual draw intervals and saves desktop/mobile screenshots plus JSON under ignored `reports/local/`. Keep the benchmark window foreground and avoid competing GPU workloads. Use `--chrome-executable` or `CHROME_PATH` if automatic executable discovery does not match the installation. No browser is downloaded automatically; `--headless` is a separate measurement mode, not proof of physical display cadence.

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

Mole Motion and Dodgeball continue to consume the compatible exact-pair observation endpoint for game input; their camera model default is also RTMPose. The smooth independent preview policy applies to the tracking console and does not change game scoring or session identity rules.
