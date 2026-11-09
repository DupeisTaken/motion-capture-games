# ADR 0005: Experimental calibrated player XYZ

**Status:** Accepted experiment scope; production geometry and hardware certification pending. **Date:** 2026-11-09. **Gate:** Partial [M1](../roadmap.md#m1-diagnostic-mirror-and-hardware-experiment). **Work:** [#4](https://github.com/DupeisTaken/motion-capture-games/issues/4).

## Context

The second camera should be evaluated for metric player and joint XYZ alongside motion tracking. The user reports 4K cameras on 1.4 m stands, not yet connected or tested. Camera count and root-relative neural landmarks do not prove room-space accuracy.

## Decision

Build an isolated, camera-free Python experiment comparing linear DLT, closest-ray midpoint and fixed-iteration reprojection refinement. Use explicit calibrated rig coordinates and already confirmed cross-view identity. Reject invalid timing/geometry/identity and publish missing XYZ. Retain primary-view 2D semantics, camera ownership, anatomical naming and session score ownership.

Adopt provisional evaluation gates of torso p95 ≤10 cm, wrist p95 ≤15 cm, reconstruction p95 <5 ms for one/three people and ≥95% nominal coverage, alongside the existing externally measured <100 ms p95 visible-feedback goal. Keep thresholds versioned. Select only a synthetic geometry candidate from measured results; do not choose a pose provider or certify a rig from the microbenchmark.

## Evidence and consequences

The [experiment design](../player-xyz-experiment.md), [result JSON](../../reports/xyz-results.json) and [standalone report](../../reports/xyz-experiment.html) own reproducibility, current numbers and limitations. Low residuals can hide wrong metric scale or cross-person matches; the synthetic negative controls deliberately expose these limits. Physical calibration, synchronization, ground-truth dynamic error, full-pipeline latency and multiplayer recovery remain open. No authoritative depth-based gameplay is enabled by this change.
