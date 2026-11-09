# Cross-component verification

Use this area for future contract, integration and replay coverage. Component-specific unit tests stay with their owning component. Add `contracts/` and `integration/` suites when the relevant interfaces are implemented.

Use synthetic fixtures for joins, identity ambiguity, missing joints, timing discontinuities, trail resets and scoring. Hardware/USB runs and external latency measurements require explicitly identified rigs; ordinary hosted CI does not certify them.

`vision/test_xyz.py` exercises the isolated stereo experiment's metric geometry, metadata and quality rejection, anatomical root, calibration-scale blind spot and nominal accuracy/coverage. Run `python3 tools/project.py test` after setup. It uses synthetic observations only and does not certify cameras, association or a pose model. See [the testing plan](../docs/testing.md). No automated CI workflow is configured yet.
