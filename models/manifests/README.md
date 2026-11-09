# Model provenance

Future manifests record model name/version, source URL, artifact hash, input/output semantics, code and weight licensing/provenance, preprocessing, export/conversion versions, supported providers and relevant measurements.

Code and pretrained weights can have different terms; record both sources without assuming one covers the other. Evaluate suitability before distributing artifacts. Download verified artifacts during setup or packaging into ignored `models/artifacts/`; gameplay must not require a live model/CDN request.

No model or weight license is selected by the foundation. No weights are committed.

The first diagnostic slice pins [diagnostic-models.json](diagnostic-models.json): MediaPipe Pose Landmarker Lite and the official RTMDet-nano/RTMPose-m CPU SDK export. The manifest records source URLs, exact download/member hashes, model input/output semantics and provenance caveats. Hashes were measured from retrieved artifacts; they are not publisher signatures or a blanket grant for redistribution.

Run `pnpm models` from the root to set up camera inference. Use `pnpm models --check` to verify local hashes without networking. Artifacts remain ignored. Setup extracts only the model files from the upstream SDK, and installed models operate offline.
