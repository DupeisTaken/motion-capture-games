# Vision service

Future local Python service owning camera acquisition, preprocessing, inference adapters, camera-local tracks, optional multi-view association, calibration and video/observation export.

Keep capture, inference, tracking, multi-view and transport as internal modules initially. Bound queues and worker/thread resources; preserve timing and calibration provenance. Publish canonical observations with quality and epoch information. Do not score games or assign session player slots.

Provider/model choice and the media path require [M1 evidence](../../docs/roadmap.md#m1-diagnostic-mirror-and-hardware-experiment). Introduce the uv project and source/test layout with that work, after checking runtime compatibility. No vision process is implemented yet.
