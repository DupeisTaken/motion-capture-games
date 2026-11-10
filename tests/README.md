# Cross-component verification

Run `pnpm test` for Vitest contract/motion/viewer tests followed by pytest vision tests. `pnpm check` adds schema drift, types, lint and formatting. The software workflow runs these checks and `pnpm build`.

- `contracts/`: canonical validation, count/capacity semantics, quality, timing and ownership boundaries.
- `motion/`: aspect-preserving mirror transforms, missing/uncertain joints, source epoch/sequence order and bounded paired-frame decoding.
- `viewer/`: simulated DOM and mocked I/O integration for automatic counts, stop/stale recovery, capacity, source errors, late decoding and image/pose geometry.
- `services/vision/tests/`: model setup/provenance, actual adapter conversion logic with synthetic model outputs, bounded camera/runtime behavior, HTTP/WebSocket controls and two association algorithms.

Identity-stability regression scenarios exercise short box disturbances, elapsed-source-time velocity updates and disagreement between last-observed and predicted assignments. They must preserve conservative retirement/recovery, current counts and unaffected identities. These scenarios test association behavior; they do not measure physical person recognition, provider ranking stability at capacity or an enrolled-player lock. Consult the change report for checks actually executed.

No test uses private participant images. Synthetic integration is not evidence of real camera accuracy, three-player identity continuity or physical latency. The real local-server browser interactions/screenshots and model smoke checks actually performed are recorded separately in [the delivery report](../reports/skeleton-diagnostics.html). See [the testing plan](../docs/testing.md) for the remaining hardware and gameplay gates.

The final-viewer release test closes its socket and waits for actual asynchronous cleanup before leaving Starlette's cancelling WebSocket context. Its bounded completion event keeps the idle/resource-release assertion meaningful without depending on thread scheduling.
