# Model provenance

Future manifests record model name/version, source URL, artifact hash, input/output semantics, code and weight licensing/provenance, preprocessing, export/conversion versions, supported providers and relevant measurements.

Code and pretrained weights can have different terms; record both sources without assuming one covers the other. Evaluate suitability before distributing artifacts. Download verified artifacts during setup or packaging into ignored `models/artifacts/`; gameplay must not require a live model/CDN request.

No model or weight license is selected by the foundation. No weights are committed.
