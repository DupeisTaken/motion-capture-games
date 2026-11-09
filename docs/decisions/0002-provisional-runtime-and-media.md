# ADR 0002: Runtime and media candidates

**Status:** Proposed; no benchmark evidence yet. **Date:** 2026-11-09. **Gate:** [M1](../roadmap.md#m1-diagnostic-mirror-and-hardware-experiment).

## Context

The first games are 2D overlays over live video. The team needs accessible computer-vision tools and Windows/macOS portability, including hardware with different acceleration capabilities. A browser renderer is convenient, but moving captured video through encoding/decoding can add latency.

## Proposal

Start the experiment with Python/OpenCV vision and a TypeScript/PixiJS mirror application. Send small canonical observations and control messages over loopback WebSocket. Evaluate local WebRTC separately for mirror video. Keep operator UI work outside the per-frame game loop. Evaluate a lightweight multi-person pipeline against a simpler baseline without binding games to either.

Use a provider adapter for inference; validate CPU correctness and compatible acceleration per model/hardware profile. Consider Windows/NVIDIA CUDA and macOS CoreML where compatible. Windows integrated acceleration needs a separately validated provider choice. Do not assume all providers, model operators, Python packages or browser GPU paths are equivalent.

## Required evidence

Measure both cameras, one and three players, actual formats, observation usefulness, video/pose skew, external feedback latency and CPU/GPU/memory use. Record model hashes, providers, OS/drivers, display mode, warm-up and workload. Evaluate crossings as well as stationary accuracy.

## Consequences and alternatives

This stack isolates vision exploration and permits lightweight game iteration. It adds cross-language contracts, copying and possible codec/browser delay. A native media bridge, browser-owned capture/inference, or native compositor may change the tradeoff. Investigate an alternative only when the first path or a concrete capability fails its gate; do not build several production stacks in parallel.

No final packaging shell is chosen. The foundation deliberately has no package manifests or dependency pins; select compatible versions with runnable tooling.

## Acceptance or revision

Update this record with measured evidence before treating the stack/video transport as accepted. If the proposed path fails the agreed latency/quality budget, change it before polished games. Scope claims to a validated rig and capacity profile.

References: [PixiJS](https://pixijs.com/8.x/guides/getting-started/intro), [aiortc](https://aiortc.readthedocs.io/en/latest/), [ONNX Runtime providers](https://onnxruntime.ai/docs/execution-providers/).
