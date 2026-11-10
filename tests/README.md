# Cross-component verification

Run `pnpm test` for Vitest contract/motion/viewer tests followed by pytest vision tests. `pnpm check` adds schema drift, types, lint and formatting. The software workflow runs these checks and `pnpm build`.

- `contracts/`: canonical validation, count/capacity semantics, quality, timing and ownership boundaries.
- `motion/`: aspect-preserving mirror transforms, missing/uncertain joints, source epoch/sequence order and bounded paired-frame decoding.
- `viewer/`: simulated DOM and mocked I/O integration for automatic counts, stop/stale recovery, capacity, source errors, late decoding and image/pose geometry.
- `services/vision/tests/`: model setup/provenance, actual adapter conversion logic with synthetic model outputs, bounded camera/runtime behavior, HTTP/WebSocket controls and two association algorithms.

No test uses private participant images. Synthetic integration is not evidence of real camera accuracy, three-player identity continuity or physical latency. The real local-server browser interactions/screenshots and model smoke checks actually performed are recorded separately in [the delivery report](../reports/skeleton-diagnostics.html). See [the testing plan](../docs/testing.md) for the remaining hardware and gameplay gates.

Console regression coverage also includes explicit permission requests, labeled device enumeration, exact browser-device identification, capture release and late results, denied/missing/busy camera recovery, hotplug invalidation, stable person rows, bounded rolling diagnostics, high-precision source-time arithmetic and fixed-deadline synthetic pacing. Browser interactions and screenshots use the real dev server with generated bodies; permission/device behavior uses mocks. See [the console report](../reports/diagnostic-console.html).
