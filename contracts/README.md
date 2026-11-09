# Shared contracts

Own the cross-process semantic boundary. [Coordinates and timing](../docs/coordinates-and-timing.md) defines the current design; it is not a published protocol.

With M1, choose one canonical schema representation, version it, and generate or validate Python/TypeScript clients from that source. Keep machine schemas in `schemas/` and synthetic payload examples in `examples/`. Include compatibility and failure cases; CI must detect schema/client drift when tooling exists.

Messages must preserve source/epoch/frame identity, coordinates/calibration, clock domains and uncertainty, joint and association quality, capabilities and explicit control acknowledgements. Never use image coordinates from a second view as if they belonged to the first. Keep game-specific score events separate from vision observations.

Do not hand-maintain two independent language definitions. There are no schemas or generated clients in the foundation.
