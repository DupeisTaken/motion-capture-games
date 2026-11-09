# Cross-component verification

Use this area for future contract, integration and replay coverage. Component-specific unit tests stay with their owning component. Add `contracts/` and `integration/` suites when the relevant interfaces are implemented.

Use synthetic fixtures for joins, identity ambiguity, missing joints, timing discontinuities, trail resets and scoring. Hardware/USB runs and external latency measurements require explicitly identified rigs; ordinary hosted CI does not certify them.

See [the testing plan](../docs/testing.md). No runtime tests or CI workflow exist in this foundation.
