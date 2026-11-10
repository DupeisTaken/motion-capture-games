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

The server does not open a camera on startup. In the viewer, choose **Camera**, set its index (0 is the initial operator fallback), select a pose model and association mode, then choose **Start camera**. OS camera permission may be needed for the host process. Use **Stop** to release capture. Hiding the browser tab stops the preview; returning requires an explicit restart. Closing the last viewer also releases its source. This is a single-operator diagnostic service; multiple tabs share one source.

Choose **Synthetic scene** to inspect rendering and the contract without a camera. The three-body, empty, and entering/leaving scenes generate observations directly: they do not measure either pose model's detection quality. They are clearly labeled in the UI and canonical payload.

## What appears on screen

- A mirrored preview with named-joint bones, joint dots and optional person bounds. The image, boxes and joints share one aspect-preserving transform; anatomical left/right never changes.
- Automatic count of the detections in the current source image. Retained/lost tracks do not add people. A detection is not an enrolled game player.
- At most the configured 1–6 detections. If the model returns the configured maximum, the UI warns that more people may exist. This is a processing cap, not a measurement of total room population or certified game-player capacity.
- Camera-local track labels, with tentative/ambiguous states. Uncertain identities do not receive an asserted track ID. There is no face recognition or persistent personal identity.
- A display confidence threshold that hides unsupported joints/bones. Scores are model outputs, not calibrated probabilities. Filtering a joint does not reduce the detected-person count.
- Measured per-frame inference duration, received preview-update rate, source-image geometry and skipped capture count. These are not external motion-to-visible latency measurements.

## Algorithms

The development default is **RTMDet-nano + RTMPose-m exported ONNX**, selected following the user’s live comparison. **MediaPipe Pose Landmarker Lite** remains an optional comparison baseline. The latter uses the official CPU archive's exact normalization, top-down affine crop and SimCC decoding. Both export the same COCO17 anatomical names. The adapter owns all model-specific indices. Models are fixed for this experiment, not a final winner for the product.

Association options are **box overlap** and **pose assisted**. They are lightweight project implementations, not stock ByteTrack. See [tracking algorithms](tracking-algorithms.md) for matching, abstention, short-gap retention and provisional tuning. Complete occlusion and visually similar people can still defeat association; the viewer shows uncertainty rather than inventing continuity. No game score or slot ownership is implemented.

## Independent preview and display timing

The viewer uses one camera owner and three independent cadences: camera capture, pose processing, and display rendering. A `requestAnimationFrame` loop draws the latest decoded image at the display’s refresh rate; image delivery and inference do not schedule draws. It never creates new camera exposures or pose measurements. A 60 Hz screen caps this loop at approximately 60 FPS; a faster display can run faster. Hidden tabs stop the source, and Stop cancels animation work.

The loopback service supplies two bounded pull streams:

- `/api/preview`: four-byte big-endian metadata length, UTF-8 [preview metadata](../contracts/schemas/preview.schema.json), then a JPEG. One independent encoding worker reads the same capture owner’s latest frame, even during slow inference. Preview metadata retains its own epoch, sequence, geometry and source-monotonic timestamp.
- `/api/observations`: JSON canonical observations from the inference worker, retaining the actual inference image’s timestamp. The browser never decodes an image on the pose channel.

The original `/api/stream` exact paired-image endpoint remains available for diagnostics and existing clients. This does not select the provisional production WebRTC path. Metadata stays bounded to 64 KiB and JPEG to 2 MiB. Capture, inference publication and preview publication each retain only current work; each stream requests its next item after consuming the previous one. Slow readers skip superseded frames. Both viewer connections include the acknowledged source epoch, so a delayed old connection cannot acquire ownership of a replacement source.

The same contain-fit/mirror transform is applied to video and geometry. A pose overlay is held only when epochs, source and geometry match and its source image is **0–150 ms older** than the displayed image. Newer-than-image poses and larger gaps are hidden; the UI reports the gap. No interpolation, prediction or scoring input is invented. Pose results expire locally after 500 ms without updates; camera imagery expires after 1.5 seconds without a received frame. The service rejects source frames older than 500 ms. These are provisional diagnostic guards, not gameplay thresholds or exposure-alignment certification.

The **Render FPS**, **Camera / source FPS**, **Pose FPS**, **Overlay gap** and inference time are separate. Render FPS counts actual animation-loop draws, including redraws of an unchanged camera image. Camera rate is measured from capture sequences and source timestamps, not a requested camera setting. Pose rate counts received unique observations. The person list and telemetry update at 4 Hz to keep DOM work off the frame loop. Synthetic scenes label their generated source rate explicitly; none of their figures establish camera/model performance.

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
