# ADR 0006: Independent preview and RTMPose development default

**Status:** Accepted for development diagnostics; production media and hardware certification remain open. **Date:** 2026-11-10. **Issue:** [#10](https://github.com/DupeisTaken/motion-capture-games/issues/10).

## Context

The user found RTMPose more useful in live comparison and selected it for future development. They requested smooth 60+ display rendering, explicitly accepting separate camera and pose rates. ADR 0005's exact paired-image viewer only draws when inference packets arrive; its three-body synthetic baseline measured about 18.5 draws/s on this development machine.

## Decision

Default to the existing pinned CPU RTMDet-nano + RTMPose-m adapter. Keep MediaPipe as a selectable comparison baseline. This is a development choice based on user feedback, not quantitative accuracy certification or acceptance of every hardware profile. Do not skip detections, reduce joint quality or silently lower person capacity to inflate performance.

Retain one acquisition owner. Add one latest-frame preview encoding worker independent of inference, and independent pull endpoints for JPEG/preview metadata and canonical pose JSON. Keep the original exact-pair endpoint for diagnostics. All pending storage is bounded; no new frame-history queue is introduced. Compile canonical JSON Schema validation once and vectorize padded detector-output filtering without changing observation semantics.

Drive Canvas2D drawing through requestAnimationFrame, and limit person-list/telemetry DOM work to 4 Hz. Measure actual display draws, camera/source rate and unique pose receipts separately. Screen refresh rate remains a ceiling; repeated display draws are not camera exposures or new pose estimates. Hidden tabs and Stop release the source and cancel animation work.

Hold an observed pose for display only when source, epoch and geometry match, its source time is no newer than the image and its lag is at most 150 ms. Hide incompatible overlays and report the gap. Also expire locally silent pose input after 500 ms and imagery after 1.5 seconds; preserve the backend 500 ms source-age rejection. No generated positions or predicted identities enter canonical observations or future scoring.

## Tradeoffs and evidence limits

The preview responds independently during slow inference but its held skeleton can lag video. The 150 ms limit is a provisional visible diagnostic tradeoff, not measured exposure alignment or an accepted collision tolerance. Faster video does not repair missing/ambiguous identity. Actual camera/inference rates may be below display rate. JPEG encoding and the legacy exact-pair endpoint still incur processing costs; WebRTC and native media paths remain options for the production media gate.

The [performance report](../../reports/preview-performance.html) owns measured draw intervals, schema overhead, synthetic screenshots, actual checks and limits. Tests cover independent delivery under blocked inference, bounds, stale overlays, source epochs and resource cleanup. Before production gameplay, measure fast-motion overlay error, external latency, one-/three-player accuracy and the full pipeline on every declared rig.

## Integration with later milestones

Retain the compact tracking console, explicit browser camera discovery, bounded stage diagnostics, high-resolution shared host clock, drift-free synthetic pacing, tracking stability fixes and Mole Motion from main. Game camera input keeps the legacy exact-pair endpoint and adopts the RTMPose default. Capture FPS uses an aggregate count/time window so short driver bursts cannot inflate it.
