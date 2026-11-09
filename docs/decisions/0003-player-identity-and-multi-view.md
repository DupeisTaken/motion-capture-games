# ADR 0003: Player identity and multi-view

**Status:** Identity principles accepted; fusion algorithm and camera geometry deferred. **Date:** 2026-11-09. **Gate:** [M1](../roadmap.md#m1-diagnostic-mirror-and-hardware-experiment).

## Context

Three players can cross and overlap. Camera-local IDs can change after occlusion or restart. Two USB cameras do not by themselves establish synchronized exposures or calibrated depth. Score ownership must survive uncertainty without guessing.

## Decision

Separate camera-local tracks, rig person associations and session player slots. Preserve slot scores when a track is uncertain. Suppress affected input during ambiguous attribution and provide explicit recovery. Never assign identity by current horizontal position. Full occlusion may require an explicit rejoin.

Use the primary view for initial 2D mirror gameplay. Evaluate the secondary view early for coverage and association. Require geometric calibration and sufficient measured timing alignment before using cross-view reconstruction for fast-motion joints. Do not directly replace primary-view joint coordinates with another camera's coordinates.

## Consequences and alternatives

Uncertainty may temporarily interrupt a player's actions, but avoids treating unsupported guesses as authoritative score ownership. Complete identity continuity is not guaranteed. Marked play zones could simplify tracking but conflict with the agreed free-movement requirement; they are not the product assumption.

Single-view tracking may suffice for some interactions; multi-view inference may reduce occlusion at the cost of compute, synchronization and association work. Decide from repeatable crossing scenarios, not camera count alone. Face recognition is not required.

## Evidence and review

Run [multiplayer scenarios](../multiplayer.md#required-diagnostic-scenarios), measure ambiguity/recovery and wrong-slot actions, and publish limitations per rig profile. Select fusion only if it improves the validated outcome. If total occlusion defeats recovery, document the boundary and rejoin flow rather than weakening identity semantics silently.
