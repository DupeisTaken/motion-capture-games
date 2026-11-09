# ADR 0004: Pretrained pose and motion experiment

**Status:** Proposed; model, tracker extension and provider await evidence. **Date:** 2026-11-09. **Gate:** [M1](../roadmap.md#m1-diagnostic-mirror-and-hardware-experiment).

**Research issue:** [#1](https://github.com/DupeisTaken/motion-capture-games/issues/1). **Review:** [PR #2](https://github.com/DupeisTaken/motion-capture-games/pull/2). Implementation and hardware gates remain open.

## Context

The initial games need primary-view 2D wrists and body regions, reliable session attribution and low-latency motion. They do not yet require metric room reconstruction or a learned action vocabulary. No model has been selected or benchmarked in this repository.

## Proposal

Benchmark pretrained RTMDet-nano + RTMPose-s, with RTMPose-m as an accuracy variant, against MediaPipe Pose Landmarker. Evaluate ByteTrack box tracking as a baseline, then a separately identified pose-assisted association extension with explicit unmatched/ambiguous states. Compare a One Euro filter with unfiltered motion. Keep geometric game rules and scoring in games, with canonical motion primitives in the motion layer.

Use the main view for initial 2D collisions. Evaluate the second view for association and coverage; require measured calibration and timing before reconstruction can support scoring. Keep camera tracks, rig tracks and session slots distinct, as required by ADR 0003.

Do not begin custom training merely to recognize reaches, slices or body overlap. If held-out evidence shows a specific recognition or localization gap, distinguish training a small skeleton-action classifier from fine-tuning the joint estimator. Preserve a simple baseline and explicit rejection policy in either case.

The [research report](../vision-research.md) owns the source-backed comparison, training escalation criteria, proposed protocol and M1-V1–V6 work briefs. The [standalone HTML](../../reports/vision-research.html) includes delivery verification.

## Consequences and alternatives

This proposal limits initial scope to observable 2D interactions while testing three-player identity early. Top-down pose cost grows with visible people, including spectators. MediaPipe can win if it meets the same gates more simply. RTMO or a pinned Ultralytics pose model can be added if a concrete integration/performance failure warrants another candidate. Artifact provenance and offline packaging must be checked for every candidate.

## Evidence required for acceptance

Record actual artifact compatibility, camera formats, source/video timing, task-joint error and valid-input coverage, full-pipeline latency, identity ambiguity/recovery and wrong-slot events on the declared rig. Compare primary-only with any second-view approach. Meet the agreed scenario gates without relying on guessed identity or hidden scoring predictions, then accept or supersede the measured choice. This research closes no M1 runtime or hardware gate.
