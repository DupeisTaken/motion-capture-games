# ADR 0001: Local modular platform

**Status:** Accepted. **Date:** 2026-11-09. **Scope:** Repository and component boundaries.

## Context

Several games share cameras, tracking, player identity, display geometry and low-latency feedback. Their rules and scoring differ. The installation must operate offline, begin with one player and expand to three with free movement.

## Decision

Use one monorepo and a local vision boundary shared by model-independent game modules. Separate capture/inference, motion processing, session ownership, game rules and mirror composition. Keep video and observation timing correlated. Support canonical pose input and game-input replay without live hardware.

Use the directory ownership described in [architecture](../architecture.md). Introduce components as needed, not speculative runtime stubs. Game rules own collisions and scoring; vision publishes observations and confidence.

## Alternatives and consequences

Independent repositories or one-off game apps would duplicate calibration and contract work. A monorepo simplifies coordinated changes and requires clear import boundaries. Cloud inference adds a dependency to the feedback loop and is outside initial scope. A single undifferentiated runtime simplifies some data sharing but couples games to capture and inference stalls.

The separate vision boundary adds media/metadata transport and alignment work; [ADR 0002](0002-provisional-runtime-and-media.md) requires validating the concrete split. This decision does not require microservices, a specific operating system, pose model or 3D reconstruction.

## Review trigger

Revisit concrete runtime placement if measurements show transport prevents the latency goal. Preserve model-independent game inputs and explicit ownership while changing implementation placement.
