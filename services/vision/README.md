# Diagnostic vision service

The first runnable middle layer owns camera acquisition, pretrained pose adapters, diagnostic camera-local tracks, automatic detected-person count and paired JPEG/observation delivery. It has no game rules or session player slots. Read [architecture](../../docs/architecture.md), [coordinates/timing](../../docs/coordinates-and-timing.md), and [multiplayer](../../docs/multiplayer.md) before extending it.

## Run

Run these commands from the checkout root after setup. See [README](../../README.md).

```text
pnpm models
pnpm vision
```

Model setup verifies pinned SHA256 values from [diagnostic-models.json](../../models/manifests/diagnostic-models.json). Inference loads local files. `pnpm models --check` verifies installed artifacts offline. Add `--algorithm mediapipe` or `--algorithm rtmpose` to narrow setup or checks. Weights stay in ignored `models/artifacts/`. Setup extracts only allowlisted ONNX members from the upstream archive.

The service listens at `127.0.0.1:8765`. Starting it does not open a camera. The operator chooses a source and starts it explicitly. Stop, service shutdown or the final stream viewer for the current epoch disconnect releases capture. Connect the stream after the start acknowledgement; an old viewer cannot stop a newer source. Browser UI origins are restricted to localhost/127.0.0.1 ports5173,4173,8765. It is a local development service, not a network API.

The smooth viewer also pulls `/api/preview` image packets and `/api/observations` JSON poses independently. One extra bounded preview worker uses the same capture owner, allowing camera delivery during slow inference. The legacy paired endpoint remains compatible. RTMPose is the development default. See [ADR 0006](../../docs/decisions/0006-independent-preview.md) for timing limits and measurements.

## Algorithms

- **MediaPipe:** Pose Landmarker Lite, CPU Tasks VIDEO mode, up to the configured pose capacity. Map its33 landmarks to named COCO17 joints. Estimated hip-relative depth is not exported as room coordinates.
- **RTMDet + RTMPose:** person-specific RTMDet-nano320×320 detection followed by RTMPose-m192×256 crops, CPU ONNX Runtime with two intra-op and one inter-op threads. Preprocessing and SimCC decoding follow the selected official CPU SDK archive's pipelines. No PyTorch, rtmlib or training stack is required.
- **Association:** choose conservative IoU/motion or pose-assisted matching from [tracking.py](motion_vision/tracking.py). These local IDs are diagnostic evidence, not score ownership or guaranteed reidentification.
- **Synthetic scene:** explicitly labeled generated silhouettes/joints; three fixed bodies, an empty scene, or a0→1→2→3 count cycle. This exercises rendering/contracts/count changes without accessing a camera. It does not test ML person detection.

The count is the current number of accepted observations, including tentative/ambiguous ones. No retained lost track adds a ghost person. `capacityReached` means the configured limit was reached; it is not proof that no additional person exists. Model scores are not calibrated probabilities. Model/threshold differences can change count and require real installation validation.

## API and transport

- `GET /api/status`: state, message, current configuration, detected count and model-file presence. Presence is not checksum certification; starting a provider verifies its model hashes.
- `POST /api/start`: strict JSON fields `source` (`camera`/`demo`), `algorithm` (`mediapipe`/`rtmpose`), `tracker` (`iou`/`pose`), `cameraIndex` (0–9), `maxPeople` (1–6), `demoScenario` (`cycle`/`three`/`empty`). It acknowledges startup; status becomes running after the first paired frame or error if startup fails.
- `POST /api/stop`: stops capture and inference and clears the last packet and count. The viewer sends its acknowledged `epoch` so a delayed stop cannot interrupt a replacement source.
- `WS /api/stream`: send `{"type":"next"}` after consuming the previous frame. Receive a binary packet or JSON `{type:"status", ...currentStatus}` while idle/error/waiting.

Each binary packet contains a4-byte big-endian JSON header length, canonical UTF-8 observation metadata (maximum64KiB), then a JPEG preview (maximum2MiB). The [canonical schema](../../contracts/schemas/observation.schema.json) validates publication. Preview pixels and joints come from exactly the same processed acquisition. This is a diagnostic paired-frame transport, not validated low-latency production media.

One capture thread opens/reads/releases the selected camera, replacing a single latest frame. One inference worker consumes the latest frame and publishes a single replaceable paired packet. Slow viewers pull current state rather than building an application-level history queue. Source drops are counted. Device driver buffering remains unverified. Host read completion time is preserved as an approximation, not an exposure timestamp; the browser must not directly compare backend monotonic values with its own clock.

## Verification and limits

Unit/integration tests use synthetic inputs and fake failures; they cover mapping/crop/color semantics, counts including zero, latest packets, restart epochs, missing models, origins, command bounds and final-viewer cleanup. Actual provider smoke tests can load both models on an empty synthetic image. Those checks establish compatibility and absence of a crash, not body-detection accuracy or performance certification.

Camera models/formats, physical camera permissions, exposure timing, three-player crossings, occlusion recovery, multi-view fusion, offline distribution rights, Windows behavior and external motion-to-visible latency still need M1 evidence. Camera indices are operator-selected diagnostic handles, not stable installation identities. No secondary-view input or calibrated3D is implemented.
