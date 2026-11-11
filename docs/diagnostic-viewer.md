# Skeleton diagnostic viewer

This is the first runnable motion-input middle layer: one locally acquired image, named body joints, a skeleton overlay, camera-local associations and an automatic visible-person count. Games can later consume the same canonical observation boundary without opening a camera or knowing model landmark indices.

## Run it

Requirements: Node **24.21.0**, pnpm **11.25.0**, and an existing Python 3.9+ interpreter to bootstrap the pinned repository-local tools. The application uses Python **3.12.16**. Windows, macOS and Linux are intended targets; only the development environment named in the delivery report has been exercised.

```text
pnpm install --frozen-lockfile
pnpm setup
pnpm dev
```

Open **http://127.0.0.1:5173**. Setup creates `.venv/`, downloads the Python interpreter/tools under ignored `.local/`, and downloads verified model files into ignored `models/artifacts/`. It needs network access once. The application makes no model/CDN/cloud request during gameplay preview. A later `pnpm models` repairs or redownloads missing artifacts.

The server does not open a camera on startup. In the viewer, choose **Camera**, select the named device under **Choose camera**, select a pose model and association mode, then choose **Start camera**. Use **Refresh** after connecting or reconnecting a USB camera. **Manual camera index** is an explicit advanced fallback (0–9). OS camera permission may be needed for the host process. Use **Stop** to release capture. Hiding the browser tab stops the preview; returning requires an explicit restart. Closing the last viewer also releases its source. This is a single-operator diagnostic service; multiple tabs share one source.

Choose **Synthetic scene** to inspect rendering and the contract without a camera. The three-body, empty, and entering/leaving scenes generate observations directly: they do not measure either pose model's detection quality. They are clearly labeled in the UI and canonical payload.

### Capture ownership and retry

The console releases only source epochs acknowledged by its own Start request. A rejected start, including a named camera that disconnected, does not stop another tab's existing source. Stop, hiding the tab and `pagehide` immediately invalidate local work, close both streams, cancel animation and release image bitmaps. If startup is still pending, the console waits for its acknowledgment and releases that epoch without opening streams. Returning to the page requires an explicit Start.

Local preview shutdown does not prove that the service or camera driver has released capture. **Retry camera stop** preserves the acknowledged epoch after HTTP 409 or a network failure and shows the service's recovery detail. Start, source selection and camera setup remain locked while startup is unresolved or release is unconfirmed; retry cannot stop a newer source owned by another tab. The same rule applies to synthetic sources.

If the service accepts Start but its response is lost or cannot identify an epoch, the current protocol cannot safely recover ownership from global status: that status may belong to another tab. The console reports unknown ownership and keeps replacement blocked. Restart the local vision service, then reload this page to recover; this deliberately affects all tabs sharing that service. Closing the page before acknowledgment or failed keepalive delivery remains a best-effort cleanup limit, not confirmed release. A startup request token or lease would require a separate protocol change.

[Issue #26](https://github.com/DupeisTaken/motion-capture-games/issues/26) and [the lifecycle report](../reports/diagnostic-capture-lifecycle.html) record the correction, synthetic regressions and actual verification. Physical camera/driver release and browser unload delivery remain unverified by these software checks.

## What appears on screen

For coordinating two camera roles and inspecting synthetic rig-meter XYZ, open [the operator workspace](two-camera-workspace.md) at `/rig.html`. It separates paired rehearsal and physical planning from this single-source console. Rehearsal and operator notes do not enable live XYZ or certify physical input.

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

The same contain-fit/mirror transform is applied to video and geometry. A pose overlay is held only when epochs, source and geometry match and its source image is **0–150 ms older** than the displayed image. Newer-than-image poses and larger gaps are hidden; the UI reports the gap. If two successive poses pass the same alignment gate, small movements of observed joints on the same confident track transition over up to 32 ms on the canvas. Missing, uncertain and large movements use the current result immediately. Counts, confidence, wire observations and game inputs use the original measurements. Pose results expire locally after 500 ms without updates. Camera imagery expires 1.5 seconds after packet receipt, including validation and JPEG decoding; an expired decode is disposed without reviving the image. Control/resize redraws use the same receipt budget. This is browser residence time, not verified exposure age. The service rejects source frames older than 500 ms. These are provisional diagnostic guards, not gameplay thresholds or exposure-alignment certification.

Pose inference uses the original capture pixels before scaling the JPEG preview, so small or distant people keep the available detail in their pose crops. Camera observations remain normalized to the image. RTMDet and RTMPose run sequentially, with up to four CPU threads per operation based on available logical CPUs, and idle worker spinning is disabled. Games request the paired stream only, so their capture does not also encode the independent preview. [Measurements and remaining camera checks](../reports/camera-tracking-latency.html) describe the test workload.

The **Render FPS**, **Camera / source FPS**, **Pose FPS**, **Overlay gap** and inference time are separate. Render FPS counts actual animation-loop draws, including redraws of an unchanged camera image. Camera rate is an aggregate capture-count/time ratio over a bounded source-clock window, not a requested camera setting or an average of instantaneous inverse intervals. This avoids inflating the rate when a driver releases frames in bursts. Pose rate counts received unique observations. The person list and telemetry update at 4 Hz to keep DOM work off the frame loop. Synthetic scenes label their generated source rate explicitly; none of their figures establish camera/model performance.

Expired first decodes show **Stale / Waiting for fresh input** and keep pulling so a fresh packet can recover. The 1.5-second guard stops new image draw submissions; retained pixels/resources are cleared on the next existing 300 ms cleanup tick. It is not a hard real-time screen-blanking guarantee. [The #3/#4 report](../reports/vision-issues.html) records controlled decoder-delay before/after evidence and real synthetic-service acceptance.

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

`pnpm check` runs repository documentation/whitespace checks, schema drift, TypeScript/Python types, ESLint/Ruff, Vitest/pytest, formatting and Python byte compilation. `pnpm build` runs independent workspace build scripts and produces the frontend in `dist/mirror/`, verifying every configured HTML entry and its local bundles. [CI conventions](continuous-integration.md) define per-language commands, OS coverage and package requirements. Run `pnpm vision` in one terminal and `pnpm preview` in another to serve that build on port 4173. Start and stop commands use Node across Windows, macOS and Linux. `pnpm dev` manages its own two child processes.

Tests use synthetic observations, fake captures and local HTTP/WebSocket clients. They check transforms, absent joints, bounded packets, ordering/restarts, counting, ambiguous association and capture/resource recovery. Model smoke checks and physical camera trials are separate evidence; consult the delivery report rather than assuming these passed from a unit-test result.

`node scripts/verify-diagnostic-lifecycle.mjs` starts its own temporary Vite server and installed headless Chrome/Edge, then checks release failures, cross-tab rejection and late startup with synthetic HTTP/WebSocket boundaries. It opens no camera or vision service. Screenshots and results go under ignored `reports/local/diagnostic-capture-lifecycle/`; use `--chrome-executable` for a nonstandard browser path. `--baseline 0cc88f7` reproduces the pre-fix console behavior. `node scripts/diagnostic-lifecycle-report.mjs` embeds the screenshots and committed results into the offline report; `--report-only` on the verification script inspects that report at desktop/mobile widths. Browser cleanup and server shutdown are task-owned.

The opt-in benchmarks run serially. `benchmark:runtime` compares reference/compiled validation on synthetic observations; `--models` also times fixed detector/pose tensors without accessing a camera. `benchmark:preview` opens an installed Chrome/Chromium, runs a generated three-body scene, records actual draw intervals and saves desktop/mobile screenshots plus JSON under ignored `reports/local/`. Keep the benchmark window foreground and avoid competing GPU workloads. Use `--chrome-executable` or `CHROME_PATH` if automatic executable discovery does not match the installation. No browser is downloaded automatically; `--headless` is a separate measurement mode, not proof of physical display cadence.

## Remaining M1 work

This slice does not implement two-view association, live calibrated 3D, player-slot enrollment, game collisions, external latency instrumentation, hardware-profile certification or production packaging. Named native camera references are re-resolved at startup; the explicit manual-index fallback has no identity guarantee across reconnects. The separate [camera-free XYZ experiment](player-xyz-experiment.md) does not supply live input. Real one-/three-person crossings and supported camera/host modes must be measured before selecting the production model or declaring M1 complete. See [roadmap](roadmap.md).

Work is tracked in [issue #3](https://github.com/DupeisTaken/motion-capture-games/issues/3), following the [research proposal](vision-research.md).

## Compact test console and camera setup

[Issue #15](https://github.com/DupeisTaken/motion-capture-games/issues/15) tracks this iteration; [the console report](../reports/diagnostic-console.html) owns actual checks and measurements. Independent high-rate preview remains in [issue #10](https://github.com/DupeisTaken/motion-capture-games/issues/10); physical M1 gates remain open.

The responsive single-page console places input/pipeline controls, preview, detections, twelve performance fields and stream context side by side on desktop. Narrow screens stack the same information with scrolling. Current model, camera/tracker, frame/epoch, clock quality, transform and calibration remain visible beside performance readings.

### Camera choice and permission

The console, Slap a Mole and Dodgeball share **Choose camera** and **Refresh** controls. Native camera names come from the vision service's `/api/cameras` metadata endpoint; enumeration does not acquire a camera, request microphone access or read images. Games discover only after Camera input is selected, so camera-free rehearsal still works without the service.

1. Connect your USB camera and choose **Refresh**. Select a named camera; with several available, no device is chosen automatically. An initially single available camera is preselected, but capture still requires **Start camera**.
2. Choose **Start camera**. The selected OS device identity is resolved again before replacing the source and after model loading, using the native capture backend's current order. A missing device fails rather than falling back to another camera. Selection and Refresh are locked during active capture; stop before switching.
3. Refresh preserves a still-connected selection across list reordering. If it disappeared, the choice clears with a disconnected message. Identical model names receive separate numbered options. Display names use text nodes, not HTML. Empty, service-error and timed-out discovery states provide recovery instructions and never silently choose a fallback.

On macOS, discovery mirrors the pinned OpenCV 4.11 AVFoundation video/muxed list sorted by unique ID. Windows uses Media Foundation metadata from pinned `cv2-enumerate-cameras` 1.4.0. Each scan runs in a fresh, serialized subprocess with a ten-second deadline and at most 32 devices; it does not open a range of camera indices. Raw OS paths/serials are replaced by opaque hashes and remain out of reports. These are device references, not participant identities or calibration records. Linux uses the same pinned enumerator with V4L2 metadata; it prefers `/dev/v4l/by-id` or `by-path` references and falls back to sysfs device topology plus interface index. A device without stable metadata requires the manual fallback. Enumeration starts no video stream or frame reads; Linux QUERYCAP metadata access briefly opens a read-only device descriptor. Physical Linux capture is not certified by software CI.

**Manual camera index** exposes the existing 0–9 field when native discovery is unavailable. It has no stable-device guarantee across reconnects. The optional **Browser camera identification** section in the console requests browser permission only after **Allow & discover cameras**. Its temporary video is released before native capture, on source changes and when hiding/closing the page. Browser IDs are setup references and are never inferred native indices.

If USB cameras are absent, unlock the Mac, reconnect the camera with a data-capable cable, and choose **Allow** for any accessory prompt. Check OS camera permission and hub power/connection, then Refresh. Software cannot list a camera the OS does not expose. Browser permission does not grant Python/OS camera permission. Only one native camera is active at a time; this selector does not implement multi-camera fusion.

The [camera selection report](../reports/camera-selection.html) records actual software and hardware checks. Hardware enumeration/opening is subject to a small OS hot-plug race because OpenCV opens by native index; changing cables during startup is not an atomic stable-ID capture guarantee. Stop/reconnect/Refresh after any device error. Windows physical capture and simultaneous USB modes remain unverified.

### Reading performance diagnostics

The rolling window contains at most 120 received observations; telemetry refreshes at most every 250 ms. Render FPS counts display-loop draws, camera/source FPS uses source-clock capture counters, and pose FPS counts received unique observations. The compatible paired endpoint follows inference cadence. Source processing includes resize/inference/tracking/JPEG encoding but ends before packet validation/serialization. Its p95 is a nearest-rank percentile over the rolling window. Read-to-processed subtracts timestamps in the source clock, including time between host read completion and processing completion.

JPEG + validation measures browser packet validation and JPEG decoding. Canvas draw measures synchronous draw submission, excluding screen presentation. Last arrival age uses only browser time and is cleared with stale observations. Packet size includes metadata and JPEG. Inference shows **n/a** for generated scenes. These fields cannot establish physical motion-to-visible latency, exposure timing or model accuracy.

On Python 3.12/Windows, `monotonic_ns` can have 15.625 ms resolution. Capture and runtime now share `perf_counter_ns`, a high-resolution monotonic host clock, so short stages no longer round to zero. The wire clock remains host-monotonic; source epochs remain the history boundary. Raw timestamps from different clock implementations or the browser must never be mixed. See [Python's clock reference](https://docs.python.org/3.12/library/time.html). Synthetic input targets 20 Hz using fixed deadlines, skipping missed ticks instead of accumulating sleep overshoot or queuing catch-up frames. Camera cadence and the production video-path decision are unchanged.

Person rows are retained while displayed identity, joint count and capacity stay unchanged. The independent animation loop draws the latest fresh image with compatible pose geometry. The sample window and existing one-frame queues remain bounded.

Slap a Mole and Dodgeball continue to consume the compatible exact-pair observation endpoint for game input; their camera model default is also RTMPose. The smooth independent preview policy applies to the tracking console and does not change game scoring or session identity rules.

## Raw camera and separate game display

Camera pictures are untinted. The console keeps its diagnostic overlay by default; **Tracking overlay** turns it off without changing inference, counting or game input. Slap a Mole and Dodgeball default to raw camera pictures with tracking graphics hidden. Their operator **Show tracking diagnostics** option exposes setup geometry only in the inline view. **Open game window** moves the existing stage and game HUD to a separate window and always hides tracking graphics there; it creates no second camera, decoder or game. Return/close restores the stage and focus. Keep the operator page open. Popup blocking leaves the inline game usable; some mobile browsers open a tab.

Start in each game records participation intent and waits for stable input, without a mandatory Select/Join sequence. Confident same-owner framing/joint loss pauses score and time, then automatically counts down to recovery. Explicit missing/uncertain identity, changed source/geometry and long gaps require a single new-round action; another track cannot inherit the score. The paired game transport still follows inference cadence; removing the tint does not make it uncompressed sensor output or the console’s independent high-rate video path. See [the camera gameplay report](../reports/raw-game-display.html).
