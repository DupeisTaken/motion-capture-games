# Cross-component verification

Run `pnpm test` for Vitest contract/motion/viewer tests followed by pytest vision tests. `pnpm check` adds repository documentation/whitespace, schema drift, types, lint and formatting. [CI conventions](../docs/continuous-integration.md) define the Ubuntu/Windows/macOS lanes, build coverage and stable merge gate. `pnpm build` runs declared workspace builds and verifies all emitted Vite entries/assets.

- `tooling/`: rejects broken local documentation links/anchors, report rendering dependencies, missing application entries/bundles and remote build scripts.

- `contracts/`: canonical validation, count/capacity semantics, quality, timing and ownership boundaries.
- `motion/`: aspect-preserving mirror transforms, missing/uncertain joints, source epoch/sequence order and bounded paired-frame decoding.
- `viewer/`: simulated DOM and mocked I/O integration for automatic counts, stop/stale recovery, capacity, source errors, late decoding and image/pose geometry.
- `games/`: deterministic Mole Motion rules for touch/push, rearming, hard placement, all four modes, pause/failure timelines and version-1 replay.
- `session/` and `motion/game-input.test.ts`: explicit single-slot membership, source-clock mapping, track/source invalidation, observed contact proxies and feet visibility. `viewer/mole-viewer.test.ts` integrates controls and camera transport with synthetic data and mocked I/O.
- `viewer/camera-release.test.ts`: acknowledged epoch cleanup, HTTP 409/network failures, retry, request deduplication and multiple late source acknowledgments. These verify release reporting/ownership; they do not certify a physical camera driver.
- `services/vision/tests/`: model setup/provenance, actual adapter conversion logic with synthetic model outputs, bounded camera/runtime behavior, HTTP/WebSocket controls and two association algorithms.

Identity-stability regression scenarios exercise short box disturbances, elapsed-source-time velocity updates and disagreement between last-observed and predicted assignments. They must preserve conservative retirement/recovery, current counts and unaffected identities. These scenarios test association behavior; they do not measure physical person recognition, provider ranking stability at capacity or an enrolled-player lock. Consult the change report for checks actually executed.

No test uses private participant images. Synthetic integration is not evidence of real camera accuracy, three-player identity continuity or physical latency. The real local-server browser interactions/screenshots and model smoke checks actually performed are recorded separately in [the delivery report](../reports/skeleton-diagnostics.html). See [the testing plan](../docs/testing.md) for the remaining hardware and gameplay gates.

Console regression coverage also includes explicit permission requests, labeled device enumeration, exact browser-device identification, capture release and late results, denied/missing/busy camera recovery, hotplug invalidation, stable person rows, bounded rolling diagnostics, high-precision source-time arithmetic and fixed-deadline synthetic pacing. Browser interactions and screenshots use the real dev server with generated bodies; permission/device behavior uses mocks. See [the console report](../reports/diagnostic-console.html).

The final-viewer release test closes its socket and waits for actual asynchronous cleanup before leaving Starlette's cancelling WebSocket context. Its bounded completion event keeps the idle/resource-release assertion meaningful without depending on thread scheduling.
