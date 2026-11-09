# Canonical schemas

[observation.schema.json](observation.schema.json) is the experimental diagnostic v1 source of truth, expressed as JSON Schema draft-07. Both the Python vision service and TypeScript renderer validate it; [generated TypeScript](../generated/observation.ts) must pass `pnpm contracts:check`.

The schema keeps source frame/epoch identity, normalized image coordinates, explicit missing/out-of-frame states, camera-track quality, source clock labels and model/transform provenance. Cross-field rules such as count equality and source-time ordering are additionally checked at boundaries. No room reconstruction or game score ownership is represented.

See [contract semantics and packet framing](../README.md) and [the owning coordinate design](../../docs/coordinates-and-timing.md). Change version/compatibility deliberately when extending this first diagnostic contract.
