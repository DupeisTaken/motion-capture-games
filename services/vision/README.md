# Vision service

Future local Python service owning camera acquisition, preprocessing, inference adapters, camera-local tracks, optional multi-view association, calibration and video/observation export.

Keep capture, inference, tracking, multi-view and transport as internal modules initially. Bound queues and worker/thread resources; preserve timing and calibration provenance. Publish canonical observations with quality and epoch information. Do not score games or assign session player slots.

Provider/model choice and the media path require [M1 evidence](../../docs/roadmap.md#m1-diagnostic-mirror-and-hardware-experiment). No camera/inference process is implemented yet. The isolated `xyz` package provides experimental metric triangulation of already paired/associated, undistorted observations. It does not open cameras or assign identities. See [the owning design](../../docs/player-xyz-experiment.md), root uv project and `tests/vision` for its bounded synchronous API, quality gates and limitations. Its Python/NumPy environment does not select a pose-model runtime.
