# ADR 0007: Camera-free XYZ comparison

## Status and context

Accepted for an isolated software experiment only. [Issue #4](https://github.com/DupeisTaken/motion-capture-games/issues/4) remains independent of the single-camera diagnostic viewer. The earlier PR #7 was reverted; its obsolete tooling must not replace the current repository setup. There is no recorded reason for that revert.

## Decision

Compare DLT, closest-ray midpoint and fixed-iteration reprojection refinement under `motion_vision.xyz`, using the existing pinned NumPy/uv environment and root checks. Validate metadata, preserve source provenance and publish explicit missing results when quality gates fail. Keep the experiment outside capture, inference, canonical wire messages, session enrollment and game scoring.

## Consequences and review gate

The [owning design](../player-xyz-experiment.md) defines reproducible scenarios, coverage/unsafe-acceptance statistics and separate serial stage timing. The [report](../../reports/vision-issues.html) records actual results. Synthetic candidate selection does not select a production model, certify a physical rig or enable depth-dependent scoring. Review this boundary before live integration; require independent calibration-scale, exposure-timing, cross-view identity and external latency evidence, and version any canonical schema extension through `contracts`.
