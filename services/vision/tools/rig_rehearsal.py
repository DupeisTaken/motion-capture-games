"""Generate recorded synthetic operator examples using the existing XYZ solver.

Run with the repository environment and PYTHONPATH=services/vision. This command
opens no cameras and imports no provider. --check compares data, ignoring JSON
whitespace so the repository's formatter can own presentation.
"""

import argparse
import json
import os
from dataclasses import replace
from pathlib import Path
from typing import Any

for variable in (
    "OPENBLAS_NUM_THREADS",
    "OMP_NUM_THREADS",
    "MKL_NUM_THREADS",
    "VECLIB_MAXIMUM_THREADS",
):
    os.environ[variable] = "1"

import numpy as np  # noqa: E402
from motion_vision.xyz.geometry import Array  # noqa: E402
from motion_vision.xyz.reconstruction import Gates, reconstruct  # noqa: E402
from tools.xyz_benchmark import JOINTS, ROOT, Scenario, cameras, make_views  # noqa: E402

OUTPUT = ROOT / "apps/mirror/src/rig-rehearsal.json"
SAMPLE_COUNT = 8
SOURCE_FRAME_END = 132
CASES = (
    (
        "nominal",
        "Nominal geometry",
        "Two calibrated synthetic views observe the same moving person.",
        "Synthetic agreement does not verify a physical rig.",
        Scenario("nominal", sigma_px=1),
    ),
    (
        "missing-hip",
        "Missing hip",
        "The secondary view has no left-hip measurement; other joints can remain available.",
        "A root requires both accepted hips. Missing coordinates stay unavailable.",
        Scenario("missing-hip", sigma_px=1),
    ),
    (
        "uncertain-identity",
        "Uncertain identity",
        "The cross-view association is not confirmed.",
        "Reconstruction is suspended rather than guessing a person's identity.",
        Scenario("uncertain-identity", identity_confirmed=False),
    ),
    (
        "exposure-skew",
        "Exposure skew",
        "The two synthetic exposures are 16 ms apart.",
        "Fast motion can amplify depth error; simultaneous host reads do not prove simultaneous exposures.",
        Scenario("exposure-skew", skew_ms=16),
    ),
    (
        "time-uncertain",
        "Exposure uncertainty",
        "Each synthetic source declares 10 ms of timing uncertainty.",
        "An uncertain exposure cannot be certified by a manual synchronization checklist.",
        Scenario("time-uncertain", uncertainty_ms=10),
    ),
    (
        "weak-geometry",
        "Weak geometry",
        "The illustrative baseline is only 6 cm.",
        "Nearly parallel rays cannot support useful depth, even with small image residuals.",
        Scenario("weak-geometry", baseline_m=0.06),
    ),
    (
        "calibration-changed",
        "Calibration revision changed",
        "The secondary observation names a different calibration revision.",
        "Moving a camera or changing image geometry invalidates the previous calibration.",
        Scenario("calibration-changed", calibration_mismatch=True),
    ),
    (
        "scale-bias",
        "Hidden scale bias",
        "The calibration baseline is 5% larger than the independent synthetic reference.",
        "Wrong metric scale can pass geometric gates. Compare the estimate with independent reference truth.",
        Scenario("scale-bias", scale_error=0.05),
    ),
    (
        "stale-input",
        "Stale source pair",
        "These recorded sources were evaluated 100 ms after their observation time.",
        "An old position cannot become current input merely because it was received or displayed later.",
        Scenario("stale-input", stale=True),
    ),
)


def point(values: Array) -> dict[str, float] | None:
    if not np.isfinite(values).all():
        return None
    return {
        axis: round(float(value), 6) for axis, value in zip(("x", "y", "z"), values, strict=True)
    }


def reference_point(values: Array) -> dict[str, float]:
    result = point(values)
    if result is None:
        raise ValueError("Synthetic reference must be finite")
    return result


def same_data(actual: Any, expected: Any) -> bool:
    """Exact provenance/missingness with 1.1 micrometer/ideal-pixel float tolerance.

    Values are rounded to six decimals. The tolerance covers rounding boundaries
    across numerical libraries without hiding any operator-visible metric drift.
    """
    if type(expected) is float:
        return (
            type(actual) in (int, float)
            and np.isfinite(actual)
            and abs(actual - expected) <= 0.0000011
        )
    if isinstance(expected, dict):
        return (
            isinstance(actual, dict)
            and actual.keys() == expected.keys()
            and all(same_data(actual[key], value) for key, value in expected.items())
        )
    if isinstance(expected, list):
        return (
            isinstance(actual, list)
            and len(actual) == len(expected)
            and all(same_data(a, b) for a, b in zip(actual, expected, strict=True))
        )
    return type(actual) is type(expected) and actual == expected


def build_rehearsal() -> dict[str, Any]:
    config = json.loads((ROOT / "configs/xyz-experiment.json").read_text(encoding="utf-8"))
    gates = Gates.from_dict(config["gates"])
    cases = []
    for case_id, title, description, risk, scenario in CASES:
        truth = cameras(scenario.baseline_m)
        estimated = cameras(scenario.baseline_m, scenario.yaw_error_deg, scenario.scale_error)
        rng = np.random.default_rng(config["seed"])
        frames = []
        for sequence in range(SAMPLE_COUNT):
            # Preserve the full 2.2-second path with a small, evenly sampled UI recording.
            source_frame = round(sequence * SOURCE_FRAME_END / (SAMPLE_COUNT - 1))
            views, reference = make_views(truth, scenario, source_frame, 0, rng)
            if case_id == "missing-hip":
                pixels = views[1].pixels.copy()
                pixels[JOINTS.index("left_hip")] = np.nan
                views = (views[0], replace(views[1], pixels=pixels))
            evaluated_at = max(v.time_ns for v in views) + (
                100_000_000 if scenario.stale else 10_000_000
            )
            result = reconstruct(
                estimated,
                views,
                calibration_id="synthetic-v1",
                epoch="sync-1",
                clock_domain="mapped-host",
                now_ns=evaluated_at,
                gates=gates,
                method="midpoint",
            )
            root = result.hip_midpoint()
            view_data = []
            for role, view, camera, reference_camera in zip(
                ("primary", "secondary"), views, estimated, truth, strict=True
            ):
                view_data.append(
                    {
                        "role": role,
                        "cameraId": view.camera_id,
                        "cameraTrackId": view.camera_track_id,
                        "rigTrackId": view.rig_track_id,
                        "frameId": str(view.frame_id),
                        "timeNs": str(view.time_ns),
                        "uncertaintyNs": str(view.uncertainty_ns),
                        "timestampKind": view.timestamp_kind,
                        "timeVerified": view.time_verified,
                        "identityConfirmed": view.identity_confirmed,
                        "calibrationId": view.calibration_id,
                        "transformRevision": view.transform_revision,
                        "clockDomain": view.clock_domain,
                        "epoch": view.epoch,
                        "imageSize": list(view.image_size),
                        "positionM": point(camera.center),
                        "referencePositionM": point(reference_camera.center),
                        "joints": [
                            {
                                "name": name,
                                "x": round(float(pixel[0]), 6)
                                if np.isfinite(pixel).all()
                                else None,
                                "y": round(float(pixel[1]), 6)
                                if np.isfinite(pixel).all()
                                else None,
                            }
                            for name, pixel in zip(view.joint_names, view.pixels, strict=True)
                        ],
                    }
                )
            frames.append(
                {
                    "sequence": sequence,
                    "timeNs": str(views[0].time_ns),
                    "evaluatedAtNs": str(evaluated_at),
                    "views": view_data,
                    "calibration": {
                        "expectedId": "synthetic-v1",
                        "baselineM": round(
                            float(np.linalg.norm(estimated[1].center - estimated[0].center)), 6
                        ),
                        "referenceBaselineM": scenario.baseline_m,
                    },
                    "timing": {
                        "skewNs": str(abs(views[0].time_ns - views[1].time_ns)),
                        "combinedUncertaintyNs": str(sum(v.uncertainty_ns for v in views)),
                    },
                    "reconstruction": {
                        "method": "midpoint",
                        "rigTrackId": result.rig_track_id,
                        "joints": [
                            {
                                "name": name,
                                **(point(position) or {"x": None, "y": None, "z": None}),
                                "reason": reason,
                            }
                            for name, position, reason in zip(
                                result.joint_names, result.positions_m, result.reasons, strict=True
                            )
                        ],
                        "root": point(root) if root is not None else None,
                    },
                    "reference": {
                        "joints": [
                            {"name": name, **reference_point(position)}
                            for name, position in zip(JOINTS, reference, strict=True)
                        ],
                        "root": reference_point(
                            reference[[JOINTS.index("left_hip"), JOINTS.index("right_hip")]].mean(
                                axis=0
                            )
                        ),
                    },
                }
            )
        cases.append(
            {
                "id": case_id,
                "title": title,
                "description": description,
                "risk": risk,
                "frames": frames,
            }
        )
    return {
        "version": 1,
        "origin": "synthetic-rehearsal",
        "recorded": True,
        "coordinateSpace": "calibrated-rig-meters",
        "cases": cases,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = build_rehearsal()
    # Reject accidental NaN/Infinity output even if a future generator changes a field.
    serialized = json.dumps(expected, ensure_ascii=False, allow_nan=False, indent=2) + "\n"
    if args.check:
        actual = json.loads(args.output.read_text(encoding="utf-8"))
        if not same_data(actual, expected):
            parser.exit(1, "Synthetic rig rehearsal data has drifted. Regenerate it.\n")
        print("Synthetic rig rehearsal data matches the XYZ solver.")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(serialized, encoding="utf-8")
        print(f"Wrote {len(CASES)} synthetic cases, {SAMPLE_COUNT} frames each: {args.output}")


if __name__ == "__main__":
    main()
