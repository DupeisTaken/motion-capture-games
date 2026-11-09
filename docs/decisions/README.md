# Architecture decisions

Use short decision records for consequential choices. State context, decision, status, consequences and the evidence that would trigger review. Add a new record to supersede a material decision rather than rewriting away its history.

| Record | Status | Meaning |
| --- | --- | --- |
| [0001: Local modular platform](0001-local-modular-platform.md) | Accepted | Local monorepo, shared motion boundary, game ownership and replay |
| [0002: Runtime and media candidates](0002-provisional-runtime-and-media.md) | Proposed | Python/TypeScript split, renderer and video transport await measurement |
| [0003: Player identity and multi-view](0003-player-identity-and-multi-view.md) | Accepted principles; fusion approach deferred | Three-player identity semantics and explicit uncertainty are required; algorithms need evidence |
| [0005: Experimental calibrated player XYZ](0005-experimental-player-xyz.md) | Experiment implemented; hardware/production pending | Compare metric triangulation candidates without certifying camera accuracy or latency |

Performance numbers in [testing](../testing.md) are targets. Synthetic geometry measurements in [the XYZ report](../../reports/xyz-experiment.html) are scoped evidence, not hardware certification. No camera model, model artifact, deployment package or hardware tier has been certified. Record 0004 is reserved by the separate vision-research work in issue #1.

For future records, use a four-digit sequence and descriptive kebab-case filename. Link the experiment/issue/PR and shareable report where available. When no remote exists, use stable local milestone references.
