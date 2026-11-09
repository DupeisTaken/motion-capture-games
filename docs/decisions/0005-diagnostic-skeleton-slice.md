# ADR 0005: Paired-frame skeleton diagnostic slice

**Status:** Accepted for this bounded diagnostic slice; production video/model/latency selection remains open. **Date:** 2026-11-09. **Issue:** [#3](https://github.com/DupeisTaken/motion-capture-games/issues/3).

## Context

The next requested step is to see body skeletons and an automatic person count, then scaffold games above the observation layer. The foundation's Python vision/TypeScript boundary remains useful, but a production WebRTC/PixiJS pipeline and final model choice are still proposals. A diagnostic viewer must not hide video/pose pairing errors or imply session-player identities.

## Decision

Use a single-owner Python capture/inference service with interchangeable MediaPipe and RTMDet/RTMPose adapters. Publish model-independent COCO17 observations from one JSON Schema, with source timing, epochs, model provenance, quality and detection capacity. Evaluate project-local box/motion and pose-assisted association modes without calling them stock ByteTrack.

For this slice, pair a bounded JPEG with observations computed from that exact image in a binary WebSocket packet. The frontend requests the next current packet after decode/render; pending capture and publication each occupy one slot. Use a TypeScript Canvas2D renderer because skeleton lines do not yet require a game renderer. Games remain absent and cannot own cameras or inference.

Keep source observations unmirrored and apply one identical presentation transform to image and geometry. Retained tracks do not inflate visible count. Ambiguous association is explicit, independent of joint score. Synthetic input is labeled at the source and shown as synthetic throughout the UI.

## Tradeoffs and evidence limits

Pairing makes the diagnostic overlay directly inspectable, but preview cadence follows inference. Encoding, decoding, USB driver buffering and external feedback latency remain to be measured. This choice does not accept WebSocket JPEG as the production video path or supersede the full M1 media gate in ADR 0002. The actual model smoke, tests, UI screenshots and unrun hardware scenarios belong in the [delivery report](../../reports/skeleton-diagnostics.html).

## Review trigger

Before games are certified, run actual camera-mode, one-/three-person accuracy/identity, source/video timing and external motion-to-visible trials. Compare an independent media path if the diagnostic pairing cannot meet the agreed responsiveness target. Add two-view geometry only with calibrated and sufficiently aligned evidence. Record the measured model/transport/capacity choice rather than treating this slice as M1 completion.
